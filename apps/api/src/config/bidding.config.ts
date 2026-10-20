import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const biddingConfig = registerAs('bidding', () => ({
  maxRetries: loadEnv().BID_MAX_RETRIES,
  sweepIntervalMs: loadEnv().AUCTION_SWEEP_INTERVAL_MS,
  winnerWindowMin: loadEnv().AUCTION_WINNER_CHECKOUT_WINDOW_MIN,
}));
