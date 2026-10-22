import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const housekeepingConfig = registerAs('housekeeping', () => {
  const env = loadEnv();
  return {
    intervalMs: env.HOUSEKEEPING_INTERVAL_MS,
    batchSize: env.HOUSEKEEPING_BATCH_SIZE,
    outboxRetentionDays: env.OUTBOX_RETENTION_DAYS,
    processedEventsRetentionDays: env.PROCESSED_EVENTS_RETENTION_DAYS,
  };
});
