import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Counter, Histogram } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';

import { queueConfig } from '../config';
import {
  QUEUE_DEAD_LETTER_TOTAL,
  QUEUE_JOB_DURATION_SECONDS,
  QUEUE_JOBS_COMPLETED_TOTAL,
  QUEUE_JOBS_FAILED_TOTAL,
} from '../metrics/metrics.constants';
import type { AppTransactionHost } from '../prisma';
import { isDeadLetter, type QueueName } from '../queue';

import { type AnyDomainEvent, EVENT_ROUTING, type EventRoutes, type EventType } from './events';

import '../common/cls/cls-store';

type JobLabel = 'queue' | 'event';

export class ProcessorConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessorConfigurationError';
  }
}

/**
 * Base of every queue processor (`@Processor(queue)` in a module's `*.processor.ts`). For each
 * job it restores the correlation context of the original request, runs `handle`, logs and
 * records metrics. A thrown error fails the job so the queue retries it. Database effects go
 * through `runIdempotent`, which makes a redelivered event a no-op.
 */
export abstract class IdempotentProcessor
  extends WorkerHost
  implements OnModuleInit, OnApplicationBootstrap
{
  /** Unique across the app: it is the inbox key that makes the processor idempotent. */
  protected abstract readonly consumerName: string;
  protected abstract readonly queue: QueueName;
  protected abstract readonly eventTypes: readonly EventType[];

  private readonly logger = new Logger('Processor');

  @Inject(EVENT_ROUTING) private readonly routes!: EventRoutes;
  @Inject(queueConfig.KEY) private readonly queueSettings!: ConfigType<typeof queueConfig>;
  @Inject(TransactionHost) private readonly txHost!: AppTransactionHost;
  @Inject(ClsService) private readonly cls!: ClsService;
  @InjectMetric(QUEUE_JOB_DURATION_SECONDS) private readonly duration!: Histogram<JobLabel>;
  @InjectMetric(QUEUE_JOBS_COMPLETED_TOTAL) private readonly completed!: Counter<JobLabel>;
  @InjectMetric(QUEUE_JOBS_FAILED_TOTAL) private readonly failed!: Counter<JobLabel>;
  @InjectMetric(QUEUE_DEAD_LETTER_TOTAL) private readonly deadLetters!: Counter<'queue'>;

  /** Handles one event. Must tolerate redelivery: use `runIdempotent` or a naturally idempotent effect. */
  protected abstract handle(event: AnyDomainEvent): Promise<void>;

  onModuleInit(): void {
    for (const type of this.eventTypes) {
      if (!this.routes[type].includes(this.queue)) {
        throw new ProcessorConfigurationError(
          `processor "${this.consumerName}" handles "${type}" on "${this.queue}", ` +
            'but EVENT_ROUTES does not route that event there',
        );
      }
    }
  }

  onApplicationBootstrap(): void {
    if (this.worker.name !== this.queue) {
      throw new ProcessorConfigurationError(
        `processor "${this.consumerName}" declares queue "${this.queue}" but listens on "${this.worker.name}"`,
      );
    }
    this.worker.concurrency = this.queueSettings.concurrency;
    this.logger.log({ msg: 'processor.started', queue: this.queue, consumer: this.consumerName });
  }

  async process(job: Job<AnyDomainEvent>): Promise<void> {
    const event = job.data;
    if (!this.eventTypes.includes(event.type)) {
      return;
    }
    const labels = { queue: this.queue, event: event.type };
    const stopTimer = this.duration.startTimer(labels);

    await this.cls.run(async () => {
      if (event.correlationId !== null) {
        this.cls.set('correlationId', event.correlationId);
      }
      this.cls.set('eventId', event.id);
      try {
        await this.handle(event);
        this.completed.inc(labels);
        this.logger.log({
          msg: 'event.consumed',
          queue: this.queue,
          consumer: this.consumerName,
          eventType: event.type,
        });
      } catch (error) {
        this.failed.inc(labels);
        this.logger.warn({
          msg: 'event.consume_failed',
          queue: this.queue,
          consumer: this.consumerName,
          eventType: event.type,
          attempt: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        stopTimer();
      }
    });
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error({ msg: 'queue.worker_error', queue: this.queue, error: error.message });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    if (job && isDeadLetter(job, error)) {
      this.deadLetters.inc({ queue: this.queue });
      this.logger.error({
        msg: 'queue.dead_letter',
        queue: this.queue,
        jobId: job.id,
        eventType: job.name,
        attempts: job.attemptsMade,
        error: error.message,
      });
    }
  }

  /**
   * Runs `effect` at most once per (consumer, event). The inbox row and the effect share one
   * transaction, so a failing effect leaves no row and the retry applies it again; a duplicate
   * delivery finds the row and skips. Returns whether the effect ran.
   */
  protected runIdempotent(eventId: string, effect: () => Promise<void>): Promise<boolean> {
    return this.txHost.withTransaction(async () => {
      const { count } = await this.txHost.tx.processedEvent.createMany({
        data: { consumer: this.consumerName, eventId },
        skipDuplicates: true,
      });
      if (count === 0) {
        return false;
      }
      await effect();
      return true;
    });
  }
}
