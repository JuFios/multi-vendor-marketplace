import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const metricsConfig = registerAs('metrics', () => ({
  workerPort: loadEnv().WORKER_METRICS_PORT,
}));
