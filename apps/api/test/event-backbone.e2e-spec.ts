import { randomUUID } from 'node:crypto';

import { Processor } from '@nestjs/bullmq';
import { Body, Controller, Inject, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';

import { getCorrelationId } from '../src/common/cls';
import { IdempotentProcessor, OutboxService } from '../src/outbox';
import { type AnyDomainEvent, EVENT_ROUTES, EVENT_ROUTING, EVENT_TYPE } from '../src/outbox/events';
import { type AppTransactionHost, PrismaService } from '../src/prisma';
import { QUEUE } from '../src/queue';

import { resetDb } from './utils/db';
import { flushEvents, queueOf } from './utils/flush-events';
import { createTestApp } from './utils/test-app';

import '../src/common/cls/cls-store';

/** Test-only: reacts to `product.created` by recording a `category.updated` event, once. */
@Processor(QUEUE.CACHE)
class BackboneProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'spec-backbone';
  protected readonly queue = QUEUE.CACHE;
  protected readonly eventTypes = [EVENT_TYPE.PRODUCT_CREATED];
  readonly seen: { eventId: string; correlationId: string | undefined }[] = [];

  constructor(private readonly outbox: OutboxService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    this.seen.push({ eventId: event.id, correlationId: getCorrelationId() });
    await this.runIdempotent(event.id, async () => {
      await this.outbox.add([
        {
          type: EVENT_TYPE.CATEGORY_UPDATED,
          aggregateType: 'Category',
          aggregateId: event.aggregateId,
          payload: { categoryId: event.aggregateId },
        },
      ]);
    });
  }
}

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
          type: EVENT_TYPE.PRODUCT_CREATED,
          aggregateType: 'Product',
          aggregateId: productId,
          payload: { productId, version: 1 },
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
  let cache: Queue;
  let processor: BackboneProcessor;

  const derivedEvents = () =>
    prisma.outboxEvent.count({ where: { eventType: 'category.updated' } });

  beforeAll(async () => {
    app = await createTestApp(
      [
        {
          token: EVENT_ROUTING,
          useValue: { ...EVENT_ROUTES, [EVENT_TYPE.PRODUCT_CREATED]: [QUEUE.CACHE] },
        },
      ],
      { imports: [BackboneModule] },
    );
    prisma = app.get(PrismaService);
    cache = queueOf(app, QUEUE.CACHE);
    processor = app.get(BackboneProcessor);
  });

  beforeEach(async () => {
    await cache.obliterate({ force: true });
    await resetDb(prisma);
    processor.seen.length = 0;
  });

  afterAll(async () => {
    await cache.obliterate({ force: true });
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
      where: { eventType: 'category.updated' },
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
      where: { eventType: 'product.created' },
    });

    // The relay "crashed" after enqueueing: forget the job and the publication mark.
    await (await cache.getJob(original.id))?.remove();
    await prisma.outboxEvent.update({ where: { id: original.id }, data: { publishedAt: null } });
    await flushEvents();
    // And the queue hands the same event over once more under another job id.
    await cache.add(
      original.eventType,
      {
        id: original.id,
        type: EVENT_TYPE.PRODUCT_CREATED,
        aggregateType: original.aggregateType,
        aggregateId: original.aggregateId,
        occurredAt: original.occurredAt.toISOString(),
        correlationId: original.correlationId,
        actorId: original.actorId,
        schemaVersion: 1,
        payload: { productId: original.aggregateId, version: 1 },
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
    const payouts = queueOf(app, QUEUE.PAYOUTS);
    await payouts.add('stuck', {}, { jobId: randomUUID() });

    await expect(flushEvents({ timeoutMs: 300 })).rejects.toThrow('the outbox and the queues');

    await payouts.obliterate({ force: true });
  });
});
