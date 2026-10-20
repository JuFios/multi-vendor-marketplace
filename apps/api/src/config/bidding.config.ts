import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const biddingConfig = registerAs('bidding', () => ({
  maxRetries: loadEnv().BID_MAX_RETRIES,
}));
