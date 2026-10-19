import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../src/redis';

/** Forgets every rate-limit counter, so a spec starts with full budgets. */
export async function resetThrottleCounters(app: NestExpressApplication): Promise<void> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const keys = await redis.keys('throttle:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
