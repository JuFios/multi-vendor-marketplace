import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const redisConfig = registerAs('redis', () => ({ url: loadEnv().REDIS_URL }));
