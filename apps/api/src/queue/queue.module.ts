import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Global, Inject, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import type { Queue } from 'bullmq';

import { redisConfig } from '../config';
import { QUEUE_WAITING_JOBS } from '../metrics/metrics.constants';

import { BullMqQueuePublisher } from './bullmq-queue.publisher';
import { QUEUE_NAMES, type QueueName } from './queue-names';
import { QUEUE_PUBLISHER } from './queue-publisher.port';
import { DEFAULT_JOB_OPTIONS } from './queue.constants';
import { redisConnectionOptions } from './redis-connection-options';

const queueTokens = QUEUE_NAMES.map((name) => getQueueToken(name));

const QUEUES = Symbol('QUEUES');

const waitingJobsGauge = makeGaugeProvider({
  name: QUEUE_WAITING_JOBS,
  help: 'Jobs waiting to be picked up, by queue.',
  labelNames: ['queue'],
  inject: queueTokens,
  async collect(...queues: Queue[]) {
    this.reset();
    const counts = await Promise.all(queues.map((queue) => queue.getWaitingCount()));
    QUEUE_NAMES.forEach((name, index) => {
      this.set({ queue: name }, counts[index] ?? 0);
    });
  },
});

/** Worker-side wiring of BullMQ: one registered queue per name, plus the publishing port. */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [redisConfig.KEY],
      useFactory: (redis: ConfigType<typeof redisConfig>) => ({
        connection: redisConnectionOptions(redis.url),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue(...QUEUE_NAMES.map((name) => ({ name }))),
  ],
  providers: [
    waitingJobsGauge,
    { provide: QUEUES, inject: queueTokens, useFactory: (...queues: Queue[]) => queues },
    {
      provide: QUEUE_PUBLISHER,
      inject: queueTokens,
      useFactory: (...queues: Queue[]) =>
        new BullMqQueuePublisher(
          new Map<QueueName, Queue>(QUEUE_NAMES.map((name, index) => [name, queues[index]!])),
        ),
    },
  ],
  exports: [BullModule, QUEUE_PUBLISHER],
})
export class QueueModule implements OnModuleInit {
  private readonly logger = new Logger('Queue');

  constructor(@Inject(QUEUES) private readonly queues: readonly Queue[]) {}

  onModuleInit(): void {
    // Without a listener BullMQ rethrows connection errors as uncaught exceptions.
    for (const queue of this.queues) {
      queue.on('error', (error) => {
        this.logger.error(`queue "${queue.name}" error: ${error.message}`);
      });
    }
  }
}
