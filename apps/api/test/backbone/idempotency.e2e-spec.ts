import { randomUUID } from 'node:crypto';

import {
  type CanActivate,
  Body,
  Controller,
  type ExecutionContext,
  HttpCode,
  Inject,
  Injectable,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import type { App } from 'supertest/types';

import { Public } from '../../src/common/decorators/public.decorator';
import { ConflictError } from '../../src/common/exceptions/app-error';
import { IDEMPOTENCY_SCOPE, IdempotencyService, Idempotent } from '../../src/idempotency';
import { OutboxService } from '../../src/outbox';
import { EVENT_TYPE } from '../../src/outbox/events';
import { type AppTransactionHost, PrismaService } from '../../src/prisma';
import { resetDb } from '../utils/db';
import { createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';
import { waitUntil } from '../utils/wait-until';

import '../../src/common/cls/cls-store';

interface OrderBody {
  orderId: string;
  item: string;
}

/** Test-only stand-in for authentication: the caller's id comes from a header. */
@Injectable()
class SpecAuthGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ headers: Record<string, string> }>().headers[
      'x-test-user'
    ];
    if (user) {
      this.cls.set('userId', user);
    }
    return true;
  }
}

/** Test-only use case whose effect is one outbox event, so rollbacks are visible in the database. */
@Injectable()
class SpecOrderService {
  failNext: 'conflict' | 'crash' | undefined;
  crashAfterCommit = false;
  /** Holds the next request before it does any work. */
  gate: Promise<void> | undefined;

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(item: string, recordInTransaction: boolean): Promise<OrderBody> {
    const gate = this.gate;
    this.gate = undefined;
    await gate;

    const body = await this.txHost.withTransaction(async () => {
      const categoryId = randomUUID();
      await this.outbox.add([
        {
          type: EVENT_TYPE.DISPUTE_MESSAGE_ADDED,
          aggregateType: 'Dispute',
          aggregateId: categoryId,
          payload: { disputeId: categoryId, sellerOrderId: categoryId },
        },
      ]);
      const failure = this.failNext;
      this.failNext = undefined;
      if (failure === 'conflict') {
        throw new ConflictError('The cart changed', 'CART_CHANGED');
      }
      if (failure === 'crash') {
        throw new Error('unexpected failure');
      }
      const created = { orderId: randomUUID(), item };
      if (recordInTransaction) {
        await this.idempotency.complete(created);
      }
      return created;
    });
    if (this.crashAfterCommit) {
      this.crashAfterCommit = false;
      throw new Error('the response was lost');
    }
    return body;
  }
}

@Public()
@Controller('idem-spec')
@UseGuards(SpecAuthGuard)
class SpecController {
  constructor(private readonly orders: SpecOrderService) {}

  @Post('orders')
  @HttpCode(201)
  @Idempotent(IDEMPOTENCY_SCOPE.CHECKOUT)
  create(@Body() body: { item: string }): Promise<OrderBody> {
    return this.orders.create(body.item, true);
  }

  @Post('forgetful')
  @HttpCode(201)
  @Idempotent(IDEMPOTENCY_SCOPE.REFUND)
  forgetful(@Body() body: { item: string }): Promise<OrderBody> {
    return this.orders.create(body.item, false);
  }
}

@Module({
  controllers: [SpecController],
  providers: [SpecOrderService, SpecAuthGuard],
})
class SpecModule {}

describe('Idempotency-Key (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let orders: SpecOrderService;
  let userId: string;

  const post = (path: string, key: string | undefined, body: object, user: string = userId) => {
    const req = request(app.getHttpServer())
      .post(`/api/idem-spec/${path}`)
      .set('x-test-user', user);
    return (key === undefined ? req : req.set('Idempotency-Key', key)).send(body);
  };
  const effects = () => prisma.outboxEvent.count();
  const keyRow = () => prisma.idempotencyKey.findFirst();

  beforeAll(async () => {
    app = await createTestApp([], { imports: [SpecModule], worker: false });
    prisma = app.get(PrismaService);
    orders = app.get(SpecOrderService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    userId = (await createUser(prisma)).id;
    orders.failNext = undefined;
    orders.crashAfterCommit = false;
    orders.gate = undefined;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([undefined, 'not-a-uuid'])('rejects a missing or malformed key (%s)', async (key) => {
    const res = await post('orders', key, { item: 'a' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    expect(await effects()).toBe(0);
  });

  it('requires an authenticated caller', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/api/idem-spec/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ item: 'a' });

    expect(res.status).toBe(401);
  });

  it('replays the recorded response for the same key and body, with one effect', async () => {
    const key = randomUUID();

    const first = await post('orders', key, { item: 'a', qty: 1 });
    const second = await post('orders', key, { qty: 1, item: 'a' });

    expect(first.status).toBe(201);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await effects()).toBe(1);
    expect(await keyRow()).toMatchObject({ status: 'COMPLETED', responseCode: 201 });
  });

  it('answers 422 when the key is reused with a different body', async () => {
    const key = randomUUID();
    await post('orders', key, { item: 'a' });

    const res = await post('orders', key, { item: 'b' });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(await effects()).toBe(1);
  });

  it('keeps keys apart per user and per scope', async () => {
    const key = randomUUID();
    const other = (await createUser(prisma)).id;

    const mine = await post('orders', key, { item: 'a' });
    const theirs = await post('orders', key, { item: 'a' }, other);
    const otherScope = await post('forgetful', key, { item: 'a' });

    expect([mine.status, theirs.status, otherScope.status]).toEqual([201, 201, 201]);
    expect(theirs.headers['idempotent-replayed']).toBeUndefined();
    expect(otherScope.headers['idempotent-replayed']).toBeUndefined();
    expect(await effects()).toBe(3);
  });

  it('rejects a concurrent request with the same key while the first is running', async () => {
    const key = randomUUID();
    let release!: () => void;
    orders.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = post('orders', key, { item: 'a' }).then((res) => res);
    await waitUntil(async () => (await keyRow())?.status === 'IN_PROGRESS', {
      label: 'the first request to claim the key',
    });

    const concurrent = await post('orders', key, { item: 'a' });
    release();
    const finished = await first;

    expect(concurrent.status).toBe(409);
    expect(concurrent.body).toMatchObject({ error: { code: 'IDEMPOTENCY_IN_PROGRESS' } });
    expect(finished.status).toBe(201);
    expect(await effects()).toBe(1);
  });

  it.each([
    ['a 4xx', 'conflict' as const, 409],
    ['a 5xx', 'crash' as const, 500],
  ])('frees the key after %s so the retry runs again', async (_name, failure, status) => {
    const key = randomUUID();
    orders.failNext = failure;

    const failed = await post('orders', key, { item: 'a' });

    expect(failed.status).toBe(status);
    expect(await keyRow()).toBeNull();
    expect(await effects()).toBe(0);

    const retry = await post('orders', key, { item: 'a' });

    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
    expect(await effects()).toBe(1);
  });

  it('replays after the response was lost following the commit', async () => {
    const key = randomUUID();
    orders.crashAfterCommit = true;

    const lost = await post('orders', key, { item: 'a' });
    const retry = await post('orders', key, { item: 'a' });

    expect(lost.status).toBe(500);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(await effects()).toBe(1);
  });

  it('takes over an abandoned key, and the old owner cannot apply its effect afterwards', async () => {
    const key = randomUUID();
    let release!: () => void;
    orders.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stalled = post('orders', key, { item: 'a' }).then((res) => res);
    await waitUntil(async () => (await keyRow())?.status === 'IN_PROGRESS', {
      label: 'the first request to claim the key',
    });
    await prisma.$executeRaw`UPDATE idempotency_keys SET created_at = now() - interval '60 seconds'`;

    const takeover = await post('orders', key, { item: 'a' });
    release();
    const late = await stalled;

    expect(takeover.status).toBe(201);
    expect(takeover.headers['idempotent-replayed']).toBeUndefined();
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({ error: { code: 'IDEMPOTENCY_IN_PROGRESS' } });
    expect(await effects()).toBe(1);
    expect(await keyRow()).toMatchObject({ status: 'COMPLETED' });
  });

  it('still records the response when the use case forgets to complete the key', async () => {
    const key = randomUUID();

    const first = await post('forgetful', key, { item: 'a' });
    const second = await post('forgetful', key, { item: 'a' });

    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await effects()).toBe(1);
  });
});
