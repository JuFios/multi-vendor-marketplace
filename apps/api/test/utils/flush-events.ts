import { getQueueToken } from '@nestjs/bullmq';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../src/prisma/prisma.service';
import { QUEUE, QUEUE_NAMES, type QueueName } from '../../src/queue/queue-names';

import { currentTestApp } from './test-app';
import { waitUntil } from './wait-until';

/** Queues whose delayed jobs are scheduled work (auction deadlines), not backlog. */
const SCHEDULED_QUEUES: readonly QueueName[] = [QUEUE.AUCTIONS];

export interface FlushEventsOptions {
  timeoutMs?: number;
  app?: NestExpressApplication;
}

export function queueOf(app: NestExpressApplication, name: QueueName): Queue {
  return app.get<Queue>(getQueueToken(name), { strict: false });
}

async function queuesAreIdle(app: NestExpressApplication): Promise<boolean> {
  const counts = await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      const states = SCHEDULED_QUEUES.includes(name)
        ? (['waiting', 'active', 'prioritized'] as const)
        : // A failed attempt waiting out its backoff is still pending work.
          (['waiting', 'active', 'prioritized', 'delayed'] as const);
      const jobs = await queueOf(app, name).getJobCounts(...states);
      return Object.values(jobs).reduce((sum, count) => sum + count, 0);
    }),
  );
  return counts.every((count) => count === 0);
}

/**
 * Waits until every recorded event has been relayed and processed, including events the
 * processors record in turn. Polls with a timeout instead of sleeping a fixed time.
 */
export async function flushEvents({
  timeoutMs = 10_000,
  app = currentTestApp(),
}: FlushEventsOptions = {}): Promise<void> {
  const prisma = app.get(PrismaService);
  await waitUntil(
    async () =>
      // Queues, then outbox, then queues again: a job that finishes in between could have
      // recorded a new event, which the second look at the queues then catches.
      (await queuesAreIdle(app)) &&
      (await prisma.outboxEvent.count({ where: { publishedAt: null } })) === 0 &&
      (await queuesAreIdle(app)),
    { timeoutMs, label: 'the outbox and the queues to drain' },
  );
}
