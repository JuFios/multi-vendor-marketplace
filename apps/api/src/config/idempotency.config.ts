import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const idempotencyConfig = registerAs('idempotency', () => {
  const env = loadEnv();
  return { ttlHours: env.IDEMPOTENCY_TTL_HOURS, lockTimeoutSec: env.IDEMPOTENCY_LOCK_TIMEOUT_SEC };
});
