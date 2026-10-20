import { Processor } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';
import request from 'supertest';

import { getContextEventId, getCorrelationId } from '../../src/common/cls/correlation-context';
import { AnalyticsProcessor } from '../../src/modules/analytics/analytics.processor';
import { CartProcessor } from '../../src/modules/cart/cart.processor';
import { NotificationsProcessor } from '../../src/modules/notifications/notifications.processor';
import { RealtimeProcessor } from '../../src/modules/notifications/realtime.processor';
import type { AnyDomainEvent } from '../../src/outbox/events/domain-event';
import { newEventId } from '../../src/outbox/events/event-id';
import { EVENT_ROUTES, EVENT_ROUTING } from '../../src/outbox/events/event-routes';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import {
  IdempotentProcessor,
  ProcessorConfigurationError,
} from '../../src/outbox/idempotent.processor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QUEUE } from '../../src/queue/queue-names';
import { QUEUE_PUBLISHER, type QueuePublisherPort } from '../../src/queue/queue-publisher.port';
import { DEFAULT_JOB_OPTIONS } from '../../src/queue/queue.constants';
import { resetDb } from '../utils/db';
import { queueOf } from '../utils/flush-events';
import { createTestApp } from '../utils/test-app';
import { waitUntil } from '../utils/wait-until';

import '../../src/common/cls/cls-store';

interface Seen {
  eventId: string;
  contextEventId: string | undefined;
  correlationId: string | undefined;
}

/** Test-only: records what it saw; its effect goes through the inbox. */
@Processor(QUEUE.REALTIME)
class EchoProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'spec-echo';
  protected readonly queue = QUEUE.REALTIME;
  protected readonly eventTypes = [EVENT_TYPE.DISPUTE_OPENED];
  readonly seen: Seen[] = [];
  applied = 0;

  protected async handle(event: AnyDomainEvent): Promise<void> {
    this.seen.push({
      eventId: event.id,
      contextEventId: getContextEventId(),
      correlationId: getCorrelationId(),
    });
    await this.runIdempotent(event.id, () => {
      this.applied += 1;
      return Promise.resolve();
    });
  }

  once(eventId: string, effect: () => Promise<void>): Promise<boolean> {
    return this.runIdempotent(eventId, effect);
  }
}

/** Test-only: fails on demand. */
@Processor(QUEUE.ANALYTICS)
class FlakyProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'spec-flaky';
  protected readonly queue = QUEUE.ANALYTICS;
  protected readonly eventTypes = [EVENT_TYPE.DISPUTE_MESSAGE_ADDED];
  calls = 0;

  protected handle(): Promise<void> {
    this.calls += 1;
    return Promise.reject(new Error('still broken'));
  }
}

@Module({ providers: [EchoProcessor, FlakyProcessor] })
class SpecProcessorsModule {}

const ROUTES = {
  ...EVENT_ROUTES,
  [EVENT_TYPE.DISPUTE_OPENED]: [QUEUE.REALTIME],
  [EVENT_TYPE.DISPUTE_MESSAGE_ADDED]: [QUEUE.ANALYTICS],
};

const productCreated = (correlationId: string): AnyDomainEvent => {
  const productId = newEventId();
  return {
    id: newEventId(),
    type: EVENT_TYPE.DISPUTE_OPENED,
    aggregateType: 'Dispute',
    aggregateId: productId,
    occurredAt: new Date().toISOString(),
    correlationId,
    actorId: null,
    schemaVersion: 1,
    payload: {
      disputeId: productId,
      sellerOrderId: productId,
      customerId: productId,
      sellerId: productId,
    },
  };
};

const categoryUpdated = (): AnyDomainEvent => {
  const productId = newEventId();
  return {
    id: newEventId(),
    type: EVENT_TYPE.DISPUTE_MESSAGE_ADDED,
    aggregateType: 'Dispute',
    aggregateId: productId,
    occurredAt: new Date().toISOString(),
    correlationId: 'req-dlq',
    actorId: null,
    schemaVersion: 1,
    payload: {
      disputeId: productId,
      sellerOrderId: productId,
      customerId: productId,
      sellerId: productId,
      authorRole: 'CUSTOMER',
    },
  };
};

describe('queue processors (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let realtime: Queue;
  let analytics: Queue;
  let echo: EchoProcessor;
  let flaky: FlakyProcessor;

  const scrape = async (): Promise<string> =>
    (await request(app.getHttpServer()).get('/metrics')).text;

  beforeAll(async () => {
    app = await createTestApp(
      [
        { token: EVENT_ROUTING, useValue: ROUTES },
        // The queue stands in for one nobody consumes.
        { token: CartProcessor, useValue: {} },
        // The spec runs its own consumer on the analytics queue.
        { token: AnalyticsProcessor, useValue: {} },
        // The spec runs its own consumer on the realtime queue.
        { token: NotificationsProcessor, useValue: {} },
        { token: RealtimeProcessor, useValue: {} },
      ],
      {
        imports: [SpecProcessorsModule],
      },
    );
    prisma = app.get(PrismaService);
    realtime = queueOf(app, QUEUE.REALTIME);
    analytics = queueOf(app, QUEUE.ANALYTICS);
    echo = app.get(EchoProcessor);
    flaky = app.get(FlakyProcessor);
  });

  beforeEach(async () => {
    await realtime.obliterate({ force: true });
    await analytics.obliterate({ force: true });
    await resetDb(prisma);
    echo.seen.length = 0;
    echo.applied = 0;
    flaky.calls = 0;
  });

  afterAll(async () => {
    await realtime.obliterate({ force: true });
    await analytics.obliterate({ force: true });
    await app.close();
  });

  it('restores the correlation context of the event while it is processed', async () => {
    const event = productCreated('req-http-1');

    await realtime.add(event.type, event, { jobId: event.id });

    await waitUntil(() => echo.seen.length === 1, { label: 'the processor to run' });
    expect(echo.seen).toEqual([
      { eventId: event.id, contextEventId: event.id, correlationId: 'req-http-1' },
    ]);
  });

  it('applies the effect exactly once when the same event is delivered twice', async () => {
    const event = productCreated('req-dup');

    await realtime.add(event.type, event, { jobId: event.id });
    await realtime.add(event.type, event, { jobId: `${event.id}-redelivery` });

    await waitUntil(() => echo.seen.length === 2, { label: 'both deliveries' });
    expect(echo.applied).toBe(1);
    expect(
      await prisma.processedEvent.count({ where: { consumer: 'spec-echo', eventId: event.id } }),
    ).toBe(1);
  });

  it('leaves no inbox row when the effect fails, so the retry applies it', async () => {
    const eventId = newEventId();

    await expect(echo.once(eventId, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    expect(await prisma.processedEvent.count({ where: { eventId } })).toBe(0);

    const applied = await echo.once(eventId, () => Promise.resolve());
    const duplicate = await echo.once(eventId, () => Promise.resolve());

    expect([applied, duplicate]).toEqual([true, false]);
  });

  it('counts failed attempts and successful jobs in the metrics', async () => {
    const updated = categoryUpdated();
    await analytics.add(updated.type, updated, { jobId: updated.id });
    await waitUntil(() => flaky.calls > 0, { label: 'the failing processor to run' });
    const created = productCreated('req-metrics-ok');
    await realtime.add(created.type, created, { jobId: created.id });
    await waitUntil(() => echo.seen.length === 1, { label: 'the successful job' });
    await waitUntil(
      async () => (await scrape()).includes('queue_jobs_completed_total{queue="realtime"'),
      {
        label: 'the completion to be counted',
      },
    );

    const text = await scrape();

    expect(text).toMatch(
      /queue_jobs_failed_total\{queue="analytics",event="dispute.message_added"\} [1-9]/,
    );
    expect(text).toMatch(
      /queue_jobs_completed_total\{queue="realtime",event="dispute.opened"\} [1-9]/,
    );
    expect(text).toMatch(
      /queue_job_duration_seconds_count\{queue="realtime",event="dispute.opened"\} [1-9]/,
    );
  });

  it('counts a job whose retries are used up and keeps it in the failed set', async () => {
    const event = categoryUpdated();

    await analytics.add(event.type, event, { jobId: event.id, attempts: 1 });

    await waitUntil(async () => (await analytics.getFailedCount()) === 1, {
      label: 'the job to land in the failed set',
    });
    await waitUntil(
      async () => /queue_dead_letter_total\{queue="analytics"\} [1-9]/.test(await scrape()),
      {
        label: 'the dead letter to be counted',
      },
    );
  });

  it('reports the number of waiting jobs per queue', async () => {
    const cart = queueOf(app, QUEUE.CART);
    await cart.add('a', categoryUpdated(), { jobId: newEventId() });
    await cart.add('b', categoryUpdated(), { jobId: newEventId() });

    const text = await scrape();
    await cart.obliterate({ force: true });

    expect(text).toContain('queue_waiting_jobs{queue="cart"} 2');
    expect(text).toContain('queue_waiting_jobs{queue="realtime"} 0');
  });

  it('runs the worker with the configured concurrency', () => {
    expect(echo.worker.concurrency).toBe(5);
  });

  it('publishes through the port as a job keyed by the event id with the default options', async () => {
    const publisher = app.get<QueuePublisherPort>(QUEUE_PUBLISHER);
    const event = productCreated('req-port');
    const queue = queueOf(app, QUEUE.CART);

    await publisher.publish(QUEUE.CART, event);
    await publisher.publish(QUEUE.CART, event);

    const job = await queue.getJob(event.id);
    expect(job?.data).toEqual(event);
    expect(job?.opts).toMatchObject({
      attempts: DEFAULT_JOB_OPTIONS.attempts,
      backoff: DEFAULT_JOB_OPTIONS.backoff,
    });
    expect((await queue.getJobCounts('waiting')).waiting).toBe(1);
    await queue.obliterate({ force: true });
  });
});

describe('processor configuration (e2e)', () => {
  @Processor(QUEUE.CART)
  class UnroutedProcessor extends IdempotentProcessor {
    protected readonly consumerName = 'spec-unrouted';
    protected readonly queue = QUEUE.CART;
    protected readonly eventTypes = [EVENT_TYPE.DISPUTE_OPENED];

    protected handle(): Promise<void> {
      return Promise.resolve();
    }
  }

  @Module({ providers: [UnroutedProcessor] })
  class UnroutedModule {}

  it('refuses to start a processor for an event type that is not routed to its queue', async () => {
    await expect(createTestApp([], { imports: [UnroutedModule] })).rejects.toBeInstanceOf(
      ProcessorConfigurationError,
    );
  });
});
