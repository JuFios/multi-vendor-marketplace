import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ClsServiceManager } from 'nestjs-cls';
import request from 'supertest';
import type { App } from 'supertest/types';

import '../../src/common/cls/cls-store';
import { NotificationsProcessor } from '../../src/modules/notifications/notifications.processor';
import type { AnyDomainEvent } from '../../src/outbox/events/domain-event';
import { newEventId } from '../../src/outbox/events/event-id';
import { EVENT_ROUTES, EVENT_ROUTING } from '../../src/outbox/events/event-routes';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import { OutboxOutsideTransactionError } from '../../src/outbox/outbox.errors';
import { OutboxRelay } from '../../src/outbox/outbox.relay';
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
  /** While set, a publication waits for it; `reached` tells when one has arrived. */
  gate: Promise<void> | null = null;
  reached = 0;
  /** Events the queue refuses on their own, while it takes every other one. */
  readonly refused = new Set<string>();
  readonly published: { queue: QueueName; event: AnyDomainEvent }[] = [];

  async publish(queue: QueueName, event: AnyDomainEvent): Promise<void> {
    this.reached += 1;
    if (this.gate !== null) {
      await this.gate;
    }
    if (this.failing || this.refused.has(event.id)) {
      throw new Error('queue unavailable');
    }
    this.published.push({ queue, event });
  }
}

const ROUTES = {
  ...EVENT_ROUTES,
  [EVENT_TYPE.DISPUTE_OPENED]: [QUEUE.REALTIME, QUEUE.SEARCH_SYNC],
  [EVENT_TYPE.DISPUTE_MESSAGE_ADDED]: [],
};

const productCreated = () => {
  const productId = newEventId();
  return {
    type: EVENT_TYPE.DISPUTE_OPENED,
    aggregateType: 'Dispute',
    aggregateId: productId,
    payload: {
      disputeId: productId,
      sellerOrderId: productId,
      customerId: productId,
      sellerId: productId,
    },
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
      { token: NotificationsProcessor, useValue: {} },
    ]);
    prisma = app.get(PrismaService);
    outbox = app.get(OutboxService);
    txHost = app.get<AppTransactionHost>(TransactionHost);
  });

  beforeEach(async () => {
    publisher.failing = false;
    publisher.gate = null;
    publisher.reached = 0;
    publisher.refused.clear();
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
      payload: {
        disputeId: newEventId(),
        sellerOrderId: newEventId(),
        customerId: newEventId(),
        sellerId: newEventId(),
        authorRole: 'CUSTOMER',
      },
    });

    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the event to be marked',
    });
    expect(publisher.published).toEqual([]);
  });

  it('leaves events of an unknown type pending without holding up the ones behind them', async () => {
    // More than one batch of rows a newer build wrote, all older than the routed event.
    const unknown = Array.from({ length: 120 }, () => ({
      id: newEventId(),
      eventType: 'future.event_type',
      aggregateType: 'Future',
      aggregateId: newEventId(),
      payload: {},
      occurredAt: new Date(Date.now() - 60_000),
    }));
    await prisma.outboxEvent.createMany({ data: unknown });

    const [id] = await addInTransaction(productCreated());

    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the routed event to be published past the unknown ones',
    });
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'future.event_type', publishedAt: null, attempts: 0 },
      }),
    ).toBe(unknown.length);
    expect(publisher.published.every(({ event }) => event.id === id)).toBe(true);
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

  it('lets an event that keeps failing on its own fall behind the ones after it', async () => {
    const stuck = productCreated();
    const stuckId = newEventId();
    publisher.refused.add(stuckId);
    await prisma.outboxEvent.create({
      data: {
        id: stuckId,
        eventType: stuck.type,
        aggregateType: stuck.aggregateType,
        aggregateId: stuck.aggregateId,
        payload: stuck.payload,
        occurredAt: new Date(Date.now() - 60_000),
        attempts: 5,
      },
    });

    const [id] = await addInTransaction(productCreated());

    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the later event to be published past the stuck one',
    });
    await waitUntil(async () => ((await row(stuckId))?.attempts ?? 0) > 5, {
      label: 'the stuck event to be retried',
    });
    expect((await row(stuckId))?.publishedAt).toBeNull();
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

  it('publishes without holding a transaction or a lock on the event', async () => {
    let release = (): void => undefined;
    publisher.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const [id] = await addInTransaction(productCreated());
    await waitUntil(() => publisher.reached > 0, { label: 'the relay to start publishing' });

    // NOWAIT fails at once if the relay still holds the row lock of an open transaction.
    const locked = await prisma.$transaction(
      (tx) => tx.$queryRaw`SELECT id FROM outbox_events WHERE id = ${id}::uuid FOR UPDATE NOWAIT`,
      { timeout: 5_000 },
    );
    expect(locked).toHaveLength(1);
    expect((await row(id ?? ''))?.claimedUntil).not.toBeNull();

    release();
    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the event to be published',
    });
    expect((await row(id ?? ''))?.claimedUntil).toBeNull();
  });

  it('does not publish an event another relay is publishing', async () => {
    let release = (): void => undefined;
    publisher.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const [id] = await addInTransaction(productCreated());
    await waitUntil(() => publisher.reached > 0, { label: 'the first relay to start publishing' });

    const second = await app.get(OutboxRelay).relayBatch();

    expect(second).toEqual({ published: 0, failed: false, full: false });
    release();
    await waitUntil(async () => (await row(id ?? ''))?.publishedAt != null, {
      label: 'the event to be published',
    });
    // Two queues, one publication each: nobody published it a second time.
    expect(publisher.published).toHaveLength(2);
  });

  it('skips an event under a live claim and takes it back once the claim ran out', async () => {
    // Created already claimed, so the polling relay never sees it unclaimed.
    const event = productCreated();
    const id = newEventId();
    await prisma.outboxEvent.create({
      data: {
        id,
        eventType: event.type,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        claimedUntil: new Date(Date.now() + 60_000),
      },
    });

    expect(await app.get(OutboxRelay).relayBatch()).toMatchObject({ published: 0 });
    expect(publisher.published).toEqual([]);
    expect((await row(id))?.publishedAt).toBeNull();

    await prisma.outboxEvent.update({
      where: { id },
      data: { claimedUntil: new Date(Date.now() - 1_000) },
    });

    await waitUntil(async () => (await row(id))?.publishedAt != null, {
      label: 'the event to be published after its claim ran out',
    });
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
