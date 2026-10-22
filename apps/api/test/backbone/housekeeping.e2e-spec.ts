import type { NestExpressApplication } from '@nestjs/platform-express';

import { HousekeepingService } from '../../src/housekeeping/housekeeping.service';
import { newEventId } from '../../src/outbox/events/event-id';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import { createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

describe('housekeeping (e2e)', () => {
  let restoreEnv: () => void;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let housekeeping: HousekeepingService;

  beforeAll(async () => {
    // Small batches, so a sweep has to repeat to get through the rows below.
    restoreEnv = overrideEnv({
      HOUSEKEEPING_BATCH_SIZE: '2',
      OUTBOX_RETENTION_DAYS: '7',
      PROCESSED_EVENTS_RETENTION_DAYS: '14',
    });
    app = await createTestApp();
    prisma = app.get(PrismaService);
    housekeeping = app.get(HousekeepingService);
    // The worker sweeps once on start; let that finish before the tests insert old rows.
    await housekeeping.startSweep();
  });

  beforeEach(() => resetDb(prisma));

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
    restoreEnv();
  });

  /** A type no route knows, so the running relay leaves the row alone. */
  const outboxRow = (publishedAt: Date | null, id = newEventId()) => ({
    id,
    eventType: 'future.event_type',
    aggregateType: 'Future',
    aggregateId: newEventId(),
    payload: {},
    occurredAt: daysAgo(40),
    publishedAt,
  });

  it('removes published outbox events past their retention and nothing else', async () => {
    const old = [daysAgo(10), daysAgo(9), daysAgo(8)].map((at) => outboxRow(at));
    const recent = outboxRow(daysAgo(1));
    const unpublished = outboxRow(null);
    await prisma.outboxEvent.createMany({ data: [...old, recent, unpublished] });

    const swept = await housekeeping.sweep();

    expect(swept.outbox_events).toBe(3);
    const left = await prisma.outboxEvent.findMany({ select: { id: true } });
    expect(left.map((event) => event.id).sort()).toEqual([recent.id, unpublished.id].sort());
    expect((await housekeeping.sweep()).outbox_events).toBe(0);
  });

  it('removes old inbox rows, but keeps those of an event still waiting in the outbox', async () => {
    const waiting = outboxRow(null);
    await prisma.outboxEvent.create({ data: waiting });
    const row = (eventId: string, processedAt: Date, consumer = 'notifications') => ({
      consumer,
      eventId,
      processedAt,
    });
    const oldIds = [newEventId(), newEventId(), newEventId()];
    const recentId = newEventId();
    await prisma.processedEvent.createMany({
      data: [
        ...oldIds.map((id) => row(id, daysAgo(20))),
        row(oldIds[0] ?? '', daysAgo(20), 'analytics'),
        row(recentId, daysAgo(2)),
        row(waiting.id, daysAgo(20)),
      ],
    });

    const swept = await housekeeping.sweep();

    expect(swept.processed_events).toBe(4);
    const left = await prisma.processedEvent.findMany({ select: { eventId: true } });
    expect(left.map((event) => event.eventId).sort()).toEqual([recentId, waiting.id].sort());
  });

  it('removes expired idempotency keys, finished or not, and keeps the valid ones', async () => {
    const user = await createUser(prisma);
    const key = (name: string, expiresAt: Date, status: 'COMPLETED' | 'IN_PROGRESS') => ({
      userId: user.id,
      scope: 'checkout',
      key: name,
      requestHash: 'hash',
      status,
      expiresAt,
    });
    await prisma.idempotencyKey.createMany({
      data: [
        key('done-old-1', daysAgo(3), 'COMPLETED'),
        key('done-old-2', daysAgo(2), 'COMPLETED'),
        key('abandoned-old', daysAgo(2), 'IN_PROGRESS'),
        key('valid', new Date(Date.now() + DAY_MS), 'COMPLETED'),
        key('valid-running', new Date(Date.now() + DAY_MS), 'IN_PROGRESS'),
      ],
    });

    const swept = await housekeeping.sweep();

    expect(swept.idempotency_keys).toBe(3);
    const left = await prisma.idempotencyKey.findMany({ select: { key: true } });
    expect(left.map((entry) => entry.key).sort()).toEqual(['valid', 'valid-running']);
  });

  it('does nothing on empty tables', async () => {
    expect(await housekeeping.sweep()).toEqual({
      outbox_events: 0,
      processed_events: 0,
      idempotency_keys: 0,
    });
  });
});
