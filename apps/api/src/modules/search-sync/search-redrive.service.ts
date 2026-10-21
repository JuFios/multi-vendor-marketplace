import { InjectQueue } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Queue } from 'bullmq';

import { withTimeout } from '../../common/utils/with-timeout';
import { searchConfig } from '../../config/search.config';
import { QUEUE } from '../../queue/queue-names';
import { SEARCH_PORT, type SearchPort } from '../../search/search.port';

const INTERVAL_NAME = 'search-redrive';
/** Failed jobs moved back per run; the next run takes the rest. */
const REDRIVE_BATCH = 100;
/** Bounds one run: a stalled Redis would otherwise keep it pending, and every later run with it. */
const REDRIVE_TIMEOUT_MS = 5000;

/**
 * Worker-only. An outage of the search index longer than the retries of a job sends its update
 * to the failed set, and the index would stay stale for good. Once the index answers again, the
 * failed updates are queued once more. That is safe: the consumer re-reads the product instead
 * of applying the event, so an old update writes the current state.
 */
@Injectable()
export class SearchRedrive implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SearchRedrive.name);
  private running: Promise<void> | undefined;

  constructor(
    @Inject(searchConfig.KEY) private readonly settings: ConfigType<typeof searchConfig>,
    @Inject(SEARCH_PORT) private readonly search: SearchPort,
    @InjectQueue(QUEUE.SEARCH_SYNC) private readonly queue: Queue,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const timer = setInterval(() => {
      // A tick that finds the previous one still running does nothing.
      this.running ??= this.tick().finally(() => {
        this.running = undefined;
      });
    }, this.settings.redriveIntervalMs);
    this.scheduler.addInterval(INTERVAL_NAME, timer);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.scheduler.doesExist('interval', INTERVAL_NAME)) {
      this.scheduler.deleteInterval(INTERVAL_NAME);
    }
    await this.running;
  }

  /** Queues the failed updates again while the index is reachable; returns how many. */
  async redrive(): Promise<number> {
    if ((await this.queue.getFailedCount()) === 0 || !(await this.search.isAvailable())) {
      return 0;
    }
    const failed = await this.queue.getFailed(0, REDRIVE_BATCH - 1);
    for (const job of failed) {
      await job.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
    }
    return failed.length;
  }

  private async tick(): Promise<void> {
    try {
      const redriven = await withTimeout(this.redrive(), REDRIVE_TIMEOUT_MS, INTERVAL_NAME);
      if (redriven > 0) {
        this.logger.log({ msg: 'search.redriven', jobs: redriven });
      }
    } catch (error) {
      this.logger.warn({
        msg: 'search.redrive_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
