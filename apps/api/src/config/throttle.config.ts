import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export interface ThrottleRule {
  readonly limit: number;
  readonly ttlMs: number;
}

const rule = (limit: number, ttlSeconds: number): ThrottleRule => ({
  limit,
  ttlMs: ttlSeconds * 1000,
});

export const throttleConfig = registerAs('throttle', () => {
  const env = loadEnv();
  return {
    default: rule(env.THROTTLE_DEFAULT_LIMIT, env.THROTTLE_DEFAULT_TTL),
    login: rule(env.THROTTLE_LOGIN_LIMIT, env.THROTTLE_LOGIN_TTL),
    register: rule(env.THROTTLE_REGISTER_LIMIT, env.THROTTLE_REGISTER_TTL),
    refresh: rule(env.THROTTLE_REFRESH_LIMIT, env.THROTTLE_REFRESH_TTL),
    bid: rule(env.THROTTLE_BID_LIMIT, env.THROTTLE_BID_TTL),
  };
});
