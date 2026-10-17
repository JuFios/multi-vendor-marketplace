import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import type { Redis } from 'ioredis';

import { APP_CONFIG, type AppConfig, type ThrottleRule } from '../../config/app-config';
import { REDIS_CLIENT } from '../redis';

import { rateLimitMetadataKey } from './rate-limit.decorator';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { THROTTLER, type OptInThrottlerName } from './throttler-names';

interface TrackerRequest {
  ip?: string;
  user?: { id?: unknown };
}

const clientIp = (req: TrackerRequest): string => req.ip ?? 'unknown';

/** Per authenticated user when known (bids), otherwise per client address. */
const userOrIp = (req: TrackerRequest): string => {
  const id = req.user?.id;
  return typeof id === 'string' ? `user:${id}` : clientIp(req);
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
      inject: [APP_CONFIG, REDIS_CLIENT],
      useFactory: (config: AppConfig, redis: Redis): ThrottlerModuleOptions => ({
        storage: new RedisThrottlerStorage(redis),
        throttlers: [
          {
            name: THROTTLER.DEFAULT,
            limit: config.throttle.default.limit,
            ttl: config.throttle.default.ttlMs,
          },
          optInThrottler(THROTTLER.LOGIN, config.throttle.login),
          optInThrottler(THROTTLER.REGISTER, config.throttle.register),
          optInThrottler(THROTTLER.REFRESH, config.throttle.refresh),
          optInThrottler(THROTTLER.BID, config.throttle.bid, userOrIp),
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
