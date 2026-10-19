import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import type { Redis } from 'ioredis';

import { throttleConfig, type ThrottleRule } from '../../config';
import { REDIS_CLIENT } from '../../redis';

import { rateLimitMetadataKey } from './rate-limit.decorator';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { THROTTLER, type OptInThrottlerName } from './throttler-names';

interface TrackerRequest {
  ip?: string;
  user?: { userId?: unknown };
  body?: unknown;
}

const clientIp = (req: TrackerRequest): string => req.ip ?? 'unknown';

/** Per authenticated user when known (bids), otherwise per client address. */
const userOrIp = (req: TrackerRequest): string => {
  const id = req.user?.userId;
  return typeof id === 'string' ? `user:${id}` : clientIp(req);
};

/** Per targeted account (the `email` of the body), so one account cannot be guessed from many addresses. */
const bodyEmailOrIp = (req: TrackerRequest): string => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim() !== ''
    ? `email:${email.trim().toLowerCase()}`
    : clientIp(req);
};

function optInThrottler(
  name: OptInThrottlerName,
  rule: ThrottleRule,
  getTracker: (req: TrackerRequest) => string = clientIp,
): ThrottlerOptions {
  const key = rateLimitMetadataKey(name);
  return {
    name,
    limit: rule.limit,
    ttl: rule.ttlMs,
    getTracker,
    skipIf: (context) =>
      !(
        (Reflect.getMetadata(key, context.getHandler()) as unknown) === true ||
        (Reflect.getMetadata(key, context.getClass()) as unknown) === true
      ),
  };
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [throttleConfig.KEY, REDIS_CLIENT],
      useFactory: (
        config: ConfigType<typeof throttleConfig>,
        redis: Redis,
      ): ThrottlerModuleOptions => ({
        storage: new RedisThrottlerStorage(redis),
        throttlers: [
          { name: THROTTLER.DEFAULT, limit: config.default.limit, ttl: config.default.ttlMs },
          optInThrottler(THROTTLER.LOGIN, config.login),
          optInThrottler(THROTTLER.LOGIN_EMAIL, config.login, bodyEmailOrIp),
          optInThrottler(THROTTLER.REGISTER, config.register),
          optInThrottler(THROTTLER.REFRESH, config.refresh),
          optInThrottler(THROTTLER.BID, config.bid, userOrIp),
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
