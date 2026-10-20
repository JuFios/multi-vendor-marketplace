import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const realtimeConfig = registerAs('realtime', () => ({
  maxSubscriptions: loadEnv().WS_MAX_SUBSCRIPTIONS,
}));
