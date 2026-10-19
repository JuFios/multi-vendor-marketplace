import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const outboxConfig = registerAs('outbox', () => {
  const env = loadEnv();
  return { pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS, batchSize: env.OUTBOX_BATCH_SIZE };
});
