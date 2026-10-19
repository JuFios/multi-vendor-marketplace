import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const queueConfig = registerAs('queue', () => ({
  concurrency: loadEnv().QUEUE_CONCURRENCY,
}));
