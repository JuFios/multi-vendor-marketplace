import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { housekeepingConfig } from '../config/housekeeping.config';
import { HOUSEKEEPING_DELETED_ROWS_TOTAL } from '../metrics/metrics.constants';
import { PrismaService } from '../prisma/prisma.service';

const INTERVAL_NAME = 'housekeeping';

type Table = 'outbox_events' | 'processed_events' | 'idempotency_keys';

/**
 * Worker-only. The event plumbing and the idempotency store only ever grow: every request and
 * every event leaves a row behind. This removes what can no longer matter, in small batches so
 * a sweep never holds many rows or locks for long. Several workers may sweep at once: a batch
 * takes only rows nobody else is deleting (SKIP LOCKED).
 *
 * - `outbox_events`: published events past their retention. Unpublished ones are never touched,
 *   whatever their age: they are still owed to a consumer.
 * - `processed_events`: inbox rows past their retention. The retention must outlast every way
 *   an event can still be delivered again: the failed-job set keeps a job for seven days, and
 *   an event still waiting in the outbox is republished, so its inbox rows are kept.
 * - `idempotency_keys`: keys past `expires_at`, finished or not. A request that reuses one
 *   deletes it anyway (see `IdempotencyService`), so no key can come back to life.
 */
@Injectable()
export class HousekeepingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HousekeepingService.name);
  private running: Promise<void> | undefined;
  private stopping = false;

  constructor(
    @Inject(housekeepingConfig.KEY) private readonly config: ConfigType<typeof housekeepingConfig>,
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
    @InjectMetric(HOUSEKEEPING_DELETED_ROWS_TOTAL) private readonly deleted: Counter<'table'>,
  ) {}

  onApplicationBootstrap(): void {
    // The first sweep starts at once: a worker restarted more often than the interval still sweeps.
    void this.startSweep();
    const timer = setInterval(() => {
      void this.startSweep();
    }, this.config.intervalMs);
    this.scheduler.addInterval(INTERVAL_NAME, timer);
  }

  /**
   * Starts a sweep in the background; one that finds the previous sweep still running does
   * nothing. Resolves when the running sweep ends, and never rejects.
   */
  startSweep(): Promise<void> {
    this.running ??= this.tick().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.scheduler.doesExist('interval', INTERVAL_NAME)) {
      this.scheduler.deleteInterval(INTERVAL_NAME);
    }
    await this.running;
  }

  /** Runs every sweep to the end; returns how many rows each table lost. */
  async sweep(): Promise<Record<Table, number>> {
    return {
      outbox_events: await this.drain('outbox_events', (limit) => this.deleteOutbox(limit)),
      processed_events: await this.drain('processed_events', (limit) =>
        this.deleteProcessedEvents(limit),
      ),
      idempotency_keys: await this.drain('idempotency_keys', (limit) =>
        this.deleteIdempotencyKeys(limit),
      ),
    };
  }

  /** Repeats a batch until one comes back short: that table has nothing more to remove. */
  private async drain(table: Table, batch: (limit: number) => Promise<number>): Promise<number> {
    const { batchSize } = this.config;
    let total = 0;
    try {
      let count: number;
      do {
        count = await batch(batchSize);
        total += count;
      } while (count === batchSize && !this.stopping);
    } catch (error) {
      // One table failing must not keep the others from being swept.
      this.logger.warn({
        msg: 'housekeeping.sweep_failed',
        table,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (total > 0) {
      this.deleted.inc({ table }, total);
      this.logger.log({ msg: 'housekeeping.swept', table, rows: total });
    }
    return total;
  }

  private deleteOutbox(limit: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM outbox_events
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE published_at IS NOT NULL
          AND published_at < now() - make_interval(days => ${this.config.outboxRetentionDays})
        ORDER BY published_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)`;
  }

  private deleteProcessedEvents(limit: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM processed_events
      WHERE (consumer, event_id) IN (
        SELECT consumer, event_id FROM processed_events AS inbox
        WHERE inbox.processed_at
              < now() - make_interval(days => ${this.config.processedEventsRetentionDays})
          AND NOT EXISTS (
            SELECT 1 FROM outbox_events AS pending
            WHERE pending.id = inbox.event_id AND pending.published_at IS NULL)
        ORDER BY inbox.processed_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)`;
  }

  private deleteIdempotencyKeys(limit: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM idempotency_keys
      WHERE id IN (
        SELECT id FROM idempotency_keys
        WHERE expires_at < now()
        ORDER BY expires_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)`;
  }

  private async tick(): Promise<void> {
    try {
      await this.sweep();
    } catch (error) {
      this.logger.error({
        msg: 'housekeeping.failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
