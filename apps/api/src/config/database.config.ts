import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const databaseConfig = registerAs('database', () => ({ url: loadEnv().DATABASE_URL }));
