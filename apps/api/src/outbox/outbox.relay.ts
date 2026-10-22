import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Counter, Histogram } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { withTimeout } from '../common/utils/with-timeout';
import { outboxConfig } from '../config/outbox.config';
import {
  OUTBOX_PUBLISH_FAILURES_TOTAL,
  OUTBOX_PUBLISH_LAG_SECONDS,
} from '../metrics/metrics.constants';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_PUBLISHER, type QueuePublisherPort } from '../queue/queue-publisher.port';

import { type AnyDomainEvent, EVENT_SCHEMA_VERSION } from './events/domain-event';
import { EVENT_ROUTING, type EventRoutes } from './events/event-routes';
import type { EventType } from './events/event-types';

const INTERVAL_NAME = 'outbox-relay';
const PUBLISH_TIMEOUT_MS = 5000;
/** How long a relay keeps the events it claimed to itself before another one may take them. */
const CLAIM_LEASE_MS = 60_000;
const MAX_BACKOFF_MS = 5000;
const MAX_ERROR_LENGTH = 500;
/**
 * Failed publications after which an event goes to the back of every batch. A queue outage fails
 * every event alike and keeps them in order; an event that fails on its own (a payload the queue
 * refuses, say) must not hold up the ones behind it forever. It is still retried each batch.
 */
const STUCK_AFTER_ATTEMPTS = 5;

interface OutboxRow {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  correlation_id: string | null;
  actor_id: string | null;
  occurred_at: Date;
  attempts: number;
}

export interface RelayBatchResult {
  published: number;
  /** True when a publish failed; the batch stopped there and the rest stays pending. */
  failed: boolean;
  /** True when the batch was full, so more events are probably waiting. */
  full: boolean;
}

/**
 * Moves committed outbox events to their consumer queues. Delivery is at-least-once: a crash
 * between enqueue and marking republishes the event once its lease runs out, and the queue
 * (jobId) and the consumers' inbox absorb the duplicate. Several relays can run side by side:
 * each leases its own batch (SKIP LOCKED), and no transaction is open while it publishes.
 *
 * Only event types this build has a route for are picked up. A row of a type it does not know
 * (written by a newer build before a rollback) stays pending, counted by `outbox_pending_events`,
 * and is relayed once a build that routes it runs again; it never holds up the events behind it.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private running: Promise<void> | undefined;
  private stopping = false;
  private consecutiveFailures = 0;
  private retryAt = 0;

  constructor(
    @Inject(outboxConfig.KEY) private readonly config: ConfigType<typeof outboxConfig>,
    @Inject(EVENT_ROUTING) private readonly routes: EventRoutes,
    @Inject(QUEUE_PUBLISHER) private readonly publisher: QueuePublisherPort,
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
    @InjectMetric(OUTBOX_PUBLISH_LAG_SECONDS) private readonly lag: Histogram,
    @InjectMetric(OUTBOX_PUBLISH_FAILURES_TOTAL) private readonly failures: Counter,
  ) {}

  onApplicationBootstrap(): void {
    // A tick that finds the previous one still running does nothing, so runs never overlap.
    const timer = setInterval(() => {
      void this.tick();
    }, this.config.pollIntervalMs);
    this.scheduler.addInterval(INTERVAL_NAME, timer);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.scheduler.doesExist('interval', INTERVAL_NAME)) {
      this.scheduler.deleteInterval(INTERVAL_NAME);
    }
    await this.running;
  }

  /**
   * Publishes one batch. The rows are claimed with a lease in one statement, published without
   * holding a transaction or a row lock, and marked in one short transaction afterwards. A
   * relay that dies in between leaves the lease to run out, and the batch is published again.
   */
  async relayBatch(): Promise<RelayBatchResult> {
    const rows = await this.claim();
    if (rows.length === 0) {
      return { published: 0, failed: false, full: false };
    }
    const deadline = Date.now() + CLAIM_LEASE_MS / 2;
    const publishedIds: string[] = [];
    let failure: { row: OutboxRow; message: string } | undefined;
    for (const row of rows) {
      // Past half the lease another relay may soon take the rest; hand it back instead.
      if (this.stopping || Date.now() >= deadline) {
        break;
      }
      try {
        await this.publish(row);
        publishedIds.push(row.id);
        this.lag.observe((Date.now() - row.occurred_at.getTime()) / 1000);
      } catch (error) {
        // Queue trouble affects every event, and stopping keeps the order of the rest.
        failure = { row, message: error instanceof Error ? error.message : String(error) };
        break;
      }
    }
    await this.settle(rows, publishedIds, failure);
    if (failure !== undefined) {
      this.failures.inc();
      this.logger.warn({
        msg: 'outbox.publish_failed',
        eventId: failure.row.id,
        eventType: failure.row.event_type,
        attempts: failure.row.attempts + 1,
        error: failure.message,
      });
    }
    return {
      published: publishedIds.length,
      failed: failure !== undefined,
      full: rows.length === this.config.batchSize,
    };
  }

  /** Leases the next batch to this relay; rows another relay leased are skipped. */
  private async claim(): Promise<OutboxRow[]> {
    const routedTypes = Object.keys(this.routes);
    const rows = await this.prisma.$queryRaw<OutboxRow[]>`
      UPDATE outbox_events AS event
      SET claimed_until = now() + make_interval(secs => ${CLAIM_LEASE_MS / 1000})
      FROM (
        SELECT id FROM outbox_events
        WHERE published_at IS NULL
          AND event_type = ANY(${routedTypes}::text[])
          AND (claimed_until IS NULL OR claimed_until < now())
        ORDER BY attempts >= ${STUCK_AFTER_ATTEMPTS}, occurred_at, id
        LIMIT ${this.config.batchSize}
        FOR UPDATE SKIP LOCKED
      ) AS next
      WHERE event.id = next.id
      RETURNING event.id, event.event_type, event.aggregate_type, event.aggregate_id,
                event.payload, event.correlation_id, event.actor_id, event.occurred_at,
                event.attempts`;
    // RETURNING does not keep the order of the subquery.
    return rows.sort(
      (a, b) =>
        Number(a.attempts >= STUCK_AFTER_ATTEMPTS) - Number(b.attempts >= STUCK_AFTER_ATTEMPTS) ||
        a.occurred_at.getTime() - b.occurred_at.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }

  /** Marks what was published, records the failure and hands back the rest, all at once. */
  private async settle(
    claimed: readonly OutboxRow[],
    publishedIds: readonly string[],
    failure: { row: OutboxRow; message: string } | undefined,
  ): Promise<void> {
    const done = new Set(publishedIds);
    const leftover = claimed
      .filter((row) => !done.has(row.id) && row.id !== failure?.row.id)
      .map((row) => row.id);
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE outbox_events SET published_at = now(), claimed_until = NULL
        WHERE id = ANY(${[...publishedIds]}::uuid[])`,
      this.prisma.$executeRaw`
        UPDATE outbox_events
        SET attempts = attempts + 1, last_error = ${failure?.message.slice(0, MAX_ERROR_LENGTH) ?? null},
            claimed_until = NULL
        WHERE id = ${failure?.row.id ?? null}::uuid`,
      this.prisma.$executeRaw`
        UPDATE outbox_events SET claimed_until = NULL WHERE id = ANY(${leftover}::uuid[])`,
    ]);
  }

  private async publish(row: OutboxRow): Promise<void> {
    // The batch query only selects routed types.
    const queues = this.routes[row.event_type as EventType];
    const event = {
      id: row.id,
      type: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      occurredAt: row.occurred_at.toISOString(),
      correlationId: row.correlation_id,
      actorId: row.actor_id,
      schemaVersion: EVENT_SCHEMA_VERSION,
      payload: row.payload,
    } as AnyDomainEvent;
    for (const queue of queues) {
      await withTimeout(
        this.publisher.publish(queue, event),
        PUBLISH_TIMEOUT_MS,
        `publish ${row.event_type} to ${queue}`,
      );
    }
  }

  private async tick(): Promise<void> {
    if (this.running !== undefined || this.stopping || Date.now() < this.retryAt) {
      return;
    }
    this.running = this.drain().finally(() => {
      this.running = undefined;
    });
    await this.running;
  }

  /** Relays batches until the outbox is empty, or backs off after a failure. */
  private async drain(): Promise<void> {
    try {
      let result: RelayBatchResult;
      do {
        result = await this.relayBatch();
      } while (result.full && !result.failed && !this.stopping);
      this.recordOutcome(result.failed);
    } catch (error) {
      this.logger.error({
        msg: 'outbox.relay_batch_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      this.recordOutcome(true);
    }
  }

  private recordOutcome(failed: boolean): void {
    this.consecutiveFailures = failed ? this.consecutiveFailures + 1 : 0;
    this.retryAt = failed
      ? Date.now() +
        Math.min(MAX_BACKOFF_MS, this.config.pollIntervalMs * 2 ** this.consecutiveFailures)
      : 0;
  }
}
