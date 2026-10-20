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
const BATCH_TRANSACTION_TIMEOUT_MS = 30_000;
const MAX_BACKOFF_MS = 5000;
const MAX_ERROR_LENGTH = 500;

interface OutboxRow {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  correlation_id: string | null;
  actor_id: string | null;
  occurred_at: Date;
}

export interface RelayBatchResult {
  published: number;
  /** True when a publish failed; the batch stopped there and the rest stays pending. */
  failed: boolean;
  /** True when the batch was full, so more events are probably waiting. */
  full: boolean;
}

/** An outbox row whose type has no route: a data problem, not a queue outage. */
class UnroutableEventError extends Error {
  constructor(type: string) {
    super(`no route for event type "${type}"`);
  }
}

/**
 * Moves committed outbox events to their consumer queues. Delivery is at-least-once: a crash
 * between enqueue and marking republishes the event, and the queue (jobId) and the consumers'
 * inbox absorb the duplicate. Several relays can run side by side thanks to SKIP LOCKED.
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

  /** Publishes one batch; the transaction lives only as long as the batch takes. */
  async relayBatch(): Promise<RelayBatchResult> {
    const { batchSize } = this.config;
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, event_type, aggregate_type, aggregate_id, payload,
                 correlation_id, actor_id, occurred_at
          FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY occurred_at, id
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED`;

        const publishedIds: string[] = [];
        let failed = false;
        for (const row of rows) {
          try {
            await this.publish(row);
            publishedIds.push(row.id);
            this.lag.observe((Date.now() - row.occurred_at.getTime()) / 1000);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await tx.$executeRaw`
              UPDATE outbox_events
              SET attempts = attempts + 1, last_error = ${message.slice(0, MAX_ERROR_LENGTH)}
              WHERE id = ${row.id}::uuid`;
            this.failures.inc();
            this.logger.warn({ msg: 'outbox.publish_failed', eventId: row.id, error: message });
            if (!(error instanceof UnroutableEventError)) {
              // Queue trouble affects every event, and stopping keeps the order of the rest.
              failed = true;
              break;
            }
          }
        }
        if (publishedIds.length > 0) {
          await tx.$executeRaw`
            UPDATE outbox_events SET published_at = now()
            WHERE id = ANY(${publishedIds}::uuid[])`;
        }
        return { published: publishedIds.length, failed, full: rows.length === batchSize };
      },
      { timeout: BATCH_TRANSACTION_TIMEOUT_MS },
    );
  }

  private async publish(row: OutboxRow): Promise<void> {
    const queues = this.routes[row.event_type as EventType] as EventRoutes[EventType] | undefined;
    if (!queues) {
      throw new UnroutableEventError(row.event_type);
    }
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
