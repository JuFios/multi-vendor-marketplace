import KeyvRedis from '@keyv/redis';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Logger, Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { redisConfig } from '../config';

import { CacheService } from './cache.service';

/** Redis-backed `@nestjs/cache-manager` behind the fail-open `CacheService`. */
@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      inject: [redisConfig.KEY],
      useFactory: (redis: ConfigType<typeof redisConfig>) => {
        const logger = new Logger('Cache');
        const store = new KeyvRedis(redis.url, { throwOnConnectError: false });
        // Without a listener an unreachable Redis would surface as an uncaught 'error' event.
        store.on('error', (error: Error) => {
          logger.error(`cache store error: ${error.message}`);
        });
        return { stores: [store] };
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
