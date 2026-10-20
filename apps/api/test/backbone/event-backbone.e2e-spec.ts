import { randomUUID } from 'node:crypto';

import { Processor } from '@nestjs/bullmq';
import { Body, Controller, Inject, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';

import { getCorrelationId } from '../../src/common/cls/correlation-context';
import { Public } from '../../src/common/decorators/public.decorator';
import type { AnyDomainEvent } from '../../src/outbox/events/domain-event';
import { EVENT_ROUTES, EVENT_ROUTING } from '../../src/outbox/events/event-routes';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import { IdempotentProcessor } from '../../src/outbox/idempotent.processor';
import { OutboxService } from '../../src/outbox/outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { AppTransactionHost } from '../../src/prisma/transaction';
import { QUEUE } from '../../src/queue/queue-names';
import { resetDb } from '../utils/db';
import { flushEvents, queueOf } from '../utils/flush-events';
import { createTestApp } from '../utils/test-app';

import '../../src/common/cls/cls-store';

/** Test-only: reacts to `dispute.opened` by recording a `dispute.message_added` event, once. */
@Processor(QUEUE.REALTIME)
class BackboneProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'spec-backbone';
  protected readonly queue = QUEUE.REALTIME;
  protected readonly eventTypes = [EVENT_TYPE.DISPUTE_OPENED];
  readonly seen: { eventId: string; correlationId: string | undefined }[] = [];

  constructor(private readonly outbox: OutboxService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    this.seen.push({ eventId: event.id, correlationId: getCorrelationId() });
    await this.runIdempotent(event.id, async () => {
      await this.outbox.add([
        {
          type: EVENT_TYPE.DISPUTE_MESSAGE_ADDED,
          aggregateType: 'Dispute',
          aggregateId: event.aggregateId,
          payload: { disputeId: event.aggregateId, sellerOrderId: event.aggregateId },
        },
      ]);
    });
  }
}

@Public()
@Controller('backbone-spec')
class BackboneController {
  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly outbox: OutboxService,
  ) {}

  @Post('products')
  async create(@Body() body: { rollback?: boolean }): Promise<{ productId: string }> {
    const productId = randomUUID();
    await this.txHost.withTransaction(async () => {
      await this.outbox.add([
        {
          type: EVENT_TYPE.DISPUTE_OPENED,
          aggregateType: 'Dispute',
          aggregateId: productId,
          payload: { disputeId: productId, sellerOrderId: productId },
        },
      ]);
      if (body.rollback) {
        throw new Error('rolled back');
      }
    });
    return { productId };
  }
}

@Module({ controllers: [BackboneController], providers: [BackboneProcessor] })
class BackboneModule {}

describe('event backbone (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let realtime: Queue;
  let processor: BackboneProcessor;

  const derivedEvents = () =>
    prisma.outboxEvent.count({ where: { eventType: 'dispute.message_added' } });

  beforeAll(async () => {
    app = await createTestApp(
      [
        {
          token: EVENT_ROUTING,
          useValue: { ...EVENT_ROUTES, [EVENT_TYPE.DISPUTE_OPENED]: [QUEUE.REALTIME] },
        },
      ],
      { imports: [BackboneModule] },
    );
    prisma = app.get(PrismaService);
    realtime = queueOf(app, QUEUE.REALTIME);
    processor = app.get(BackboneProcessor);
  });

  beforeEach(async () => {
    await realtime.obliterate({ force: true });
    await resetDb(prisma);
    processor.seen.length = 0;
  });

  afterAll(async () => {
    await realtime.obliterate({ force: true });
    await app.close();
  });

  it('carries the correlation id of the request through the relay into the processor', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/api/backbone-spec/products')
      .set('X-Request-Id', 'req-backbone-1')
      .send({});

    await flushEvents();

    expect(res.status).toBe(201);
    expect(res.headers['x-request-id']).toBe('req-backbone-1');
    expect(processor.seen).toHaveLength(1);
    expect(processor.seen[0]?.correlationId).toBe('req-backbone-1');
    const derived = await prisma.outboxEvent.findFirst({
      where: { eventType: 'dispute.message_added' },
    });
    expect(derived?.correlationId).toBe('req-backbone-1');
    expect(derived?.publishedAt).not.toBeNull();
  });

  it('produces no event when the request fails and rolls back', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/api/backbone-spec/products')
      .send({ rollback: true });

    await flushEvents();

    expect(res.status).toBe(500);
    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(processor.seen).toEqual([]);
  });

  it('applies the effect once when the relay republishes and the queue delivers twice', async () => {
    await request(app.getHttpServer() as App)
      .post('/api/backbone-spec/products')
      .send({});
    await flushEvents();
    const original = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'dispute.opened' },
    });

    // The relay "crashed" after enqueueing: forget the job and the publication mark.
    await (await realtime.getJob(original.id))?.remove();
    await prisma.outboxEvent.update({ where: { id: original.id }, data: { publishedAt: null } });
    await flushEvents();
    // And the queue hands the same event over once more under another job id.
    await realtime.add(
      original.eventType,
      {
        id: original.id,
        type: EVENT_TYPE.DISPUTE_OPENED,
        aggregateType: original.aggregateType,
        aggregateId: original.aggregateId,
        occurredAt: original.occurredAt.toISOString(),
        correlationId: original.correlationId,
        actorId: original.actorId,
        schemaVersion: 1,
        payload: { disputeId: original.aggregateId, sellerOrderId: original.aggregateId },
      },
      { jobId: `${original.id}-again` },
    );
    await flushEvents();

    expect(processor.seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(processor.seen.map(({ eventId }) => eventId))).toEqual(new Set([original.id]));
    expect(await derivedEvents()).toBe(1);
    expect(await prisma.processedEvent.count({ where: { consumer: 'spec-backbone' } })).toBe(1);
  });

  it('fails clearly when the system does not settle in time', async () => {
    const stuckQueue = queueOf(app, QUEUE.CART);
    await stuckQueue.add('stuck', {}, { jobId: randomUUID() });

    await expect(flushEvents({ timeoutMs: 300 })).rejects.toThrow('the outbox and the queues');

    await stuckQueue.obliterate({ force: true });
  });
});
