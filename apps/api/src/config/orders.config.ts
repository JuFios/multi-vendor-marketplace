import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const ordersConfig = registerAs('orders', () => ({
  commissionBps: loadEnv().PLATFORM_COMMISSION_BPS,
}));
