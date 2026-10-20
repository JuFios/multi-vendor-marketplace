import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ClsServiceManager } from 'nestjs-cls';
import request from 'supertest';
import type { App } from 'supertest/types';

import '../../src/common/cls/cls-store';
import type { AnyDomainEvent } from '../../src/outbox/events/domain-event';
import { newEventId } from '../../src/outbox/events/event-id';
import { EVENT_ROUTES, EVENT_ROUTING } from '../../src/outbox/events/event-routes';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import { OutboxOutsideTransactionError } from '../../src/outbox/outbox.errors';
import { OutboxService } from '../../src/outbox/outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { AppTransactionHost } from '../../src/prisma/transaction';
import { QUEUE, type QueueName } from '../../src/queue/queue-names';
import { QUEUE_PUBLISHER, type QueuePublisherPort } from '../../src/queue/queue-publisher.port';
import { resetDb } from '../utils/db';
import { createTestApp } from '../utils/test-app';
import { waitUntil } from '../utils/wait-until';

class RecordingPublisher implements QueuePublisherPort {
  failing = false;
  readonly published: { queue: QueueName; event: AnyDomainEvent }[] = [];

  publish(queue: QueueName, event: AnyDomainEvent): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error('queue unavailable'));
    }
    this.published.push({ queue, event });
    return Promise.resolve();
  }
}

const ROUTES = {
  ...EVENT_ROUTES,
  [EVENT_TYPE.DISPUTE_OPENED]: [QUEUE.REALTIME, QUEUE.SEARCH_SYNC],
};

const productCreated = () => {
  const productId = newEventId();
  return {
    type: EVENT_TYPE.DISPUTE_OPENED,
    aggregateType: 'Dispute',
    aggregateId: productId,
    payload: { disputeId: productId, sellerOrderId: productId },
  } as const;
};

describe('outbox (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let outbox: OutboxService;
  let txHost: AppTransactionHost;
  const publisher = new RecordingPublisher();

  const addInTransaction = (...events: Parameters<OutboxService['add']>[0][number][]) =>
    txHost.withTransaction(() => outbox.add(events));
  const row = (id: string) => prisma.outboxEvent.findUnique({ where: { id } });

  beforeAll(async () => {
    app = await createTestApp([
      { token: QUEUE_PUBLISHER, useValue: publisher },
      { token: EVENT_ROUTING, useValue: ROUTES },
    ]);
    prisma = app.get(PrismaService);
    outbox = app.get(OutboxService);
    txHost = app.get<AppTransactionHost>(TransactionHost);
  });

  beforeEach(async () => {
    publisher.failing = false;
    publisher.published.length = 0;
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses events added outside a transaction', async () => {
    await expect(outbox.add([productCreated()])).rejects.toBeInstanceOf(
      OutboxOutsideTransactionError,
    );
    expect(await prisma.outboxEvent.count()).toBe(0);
  });

  it('records nothing when the transaction rolls back', async () => {
    await expect(
      txHost.withTransaction(async () => {
        await outbox.add([productCreated()]);
        throw new Error('business rule violated');
      }),
    ).rejects.toThrow('business rule violated');

    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(publisher.published).toEqual([]);
  });

  it('publishes a committed event to every routed queue with the request correlation id', async () => {
    const cls = ClsServiceManager.getClsService();
    const event = productCreated();

    const [id] = await cls.run(() => {
      cls.set('correlationId', 'req-e2e-1');
      return addInTransaction(event);
    });

    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the event to be published',
    });
    expect(publisher.published.map(({ queue }) => queue).sort()).toEqual([
      QUEUE.REALTIME,
      QUEUE.SEARCH_SYNC,
    ]);
    for (const { event: delivered } of publisher.published) {
      expect(delivered).toMatchObject({
        id,
        type: EVENT_TYPE.DISPUTE_OPENED,
        aggregateType: 'Dispute',
        aggregateId: event.aggregateId,
        correlationId: 'req-e2e-1',
        schemaVersion: 1,
        payload: event.payload,
      });
      expect(new Date(delivered.occurredAt).toISOString()).toBe(delivered.occurredAt);
    }
  });

  it('marks events without a consumer as published without calling the queue', async () => {
    const [id] = await addInTransaction({
      type: EVENT_TYPE.DISPUTE_MESSAGE_ADDED,
      aggregateType: 'Dispute',
      aggregateId: newEventId(),
      payload: { disputeId: newEventId(), sellerOrderId: newEventId() },
    });

    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the event to be marked',
    });
    expect(publisher.published).toEqual([]);
  });

  it('keeps events pending while the queue is down and publishes them after recovery', async () => {
    publisher.failing = true;
    const [id] = await addInTransaction(productCreated());

    await waitUntil(async () => ((await row(id ?? ''))?.attempts ?? 0) > 0, {
      label: 'a failed attempt to be recorded',
    });
    const pending = await row(id ?? '');
    expect(pending?.publishedAt).toBeNull();
    expect(pending?.lastError).toContain('queue unavailable');

    publisher.failing = false;

    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      timeoutMs: 15_000,
      label: 'the event to be published after recovery',
    });
    expect(publisher.published).toHaveLength(2);
  });

  it('republishes the same event when the relay died before marking it', async () => {
    const [id] = await addInTransaction(productCreated());
    await waitUntil(() => publisher.published.length === 2, { label: 'the first publication' });
    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the event to be marked',
    });

    await prisma.outboxEvent.update({ where: { id: id ?? '' }, data: { publishedAt: null } });

    await waitUntil(() => publisher.published.length === 4, { label: 'the republication' });
    const ids = new Set(publisher.published.map(({ event }) => event.id));
    expect([...ids]).toEqual([id]);
  });

  it('exposes the outbox metrics', async () => {
    const [id] = await addInTransaction(productCreated());
    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the event to be published',
    });

    const response = await request(app.getHttpServer() as App)
      .get('/metrics')
      .expect(200);

    expect(response.text).toContain('outbox_pending_events 0');
    expect(response.text).toContain('outbox_publish_lag_seconds_count');
    expect(response.text).toContain('outbox_publish_failures_total');
  });
});
