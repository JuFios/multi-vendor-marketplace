import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const analyticsConfig = registerAs('analytics', () => ({
  timeZone: loadEnv().ANALYTICS_TIMEZONE,
}));
