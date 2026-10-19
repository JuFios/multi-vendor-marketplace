import type { DefaultJobOptions } from 'bullmq';

const ONE_HOUR_SECONDS = 60 * 60;
const SEVEN_DAYS_SECONDS = 7 * 24 * ONE_HOUR_SECONDS;

/**
 * Applied to every job. Completed jobs are kept briefly for debugging; failed ones stay
 * for a week, because the failed set is the dead-letter queue.
 */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: ONE_HOUR_SECONDS, count: 1000 },
  removeOnFail: { age: SEVEN_DAYS_SECONDS },
};
