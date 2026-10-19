import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const paymentsConfig = registerAs('payments', () => ({
  mockFailureRate: loadEnv().MOCK_PAYMENT_FAILURE_RATE,
}));
