import type { NestExpressApplication } from '@nestjs/platform-express';

import type { PrismaClient } from '../../src/generated/prisma/client';
import { QUEUE_NAMES } from '../../src/queue/queue-names';

import { resetDb } from './db';
import { flushEvents, queueOf } from './flush-events';
import { currentTestApp } from './test-app';

/**
 * Starts the next test from a quiet system. Consumers still working on the previous test's
 * events would otherwise lose their rows under the truncate, fail, and retry with a backoff
 * long enough to outlast the next `flushEvents`. So: let the work finish, wipe the data, and
 * drop whatever is still queued (timers and retries of rows that no longer exist).
 */
export async function resetState(
  prisma: PrismaClient,
  app: NestExpressApplication = currentTestApp(),
): Promise<void> {
  await flushEvents({ app });
  await resetDb(prisma);
  await Promise.all(QUEUE_NAMES.map((name) => queueOf(app, name).obliterate({ force: true })));
}
