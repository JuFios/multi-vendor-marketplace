import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { RedisConnectionFactory } from './redis-connection.factory';
import { REDIS_CLIENT } from './redis.constants';

// Fail commands fast while Redis is unreachable instead of queueing them forever.
const MAX_RETRIES_PER_REQUEST = 2;

@Global()
@Module({
  providers: [
    RedisConnectionFactory,
    {
      provide: REDIS_CLIENT,
      inject: [RedisConnectionFactory],
      useFactory: (factory: RedisConnectionFactory): Redis =>
        factory.create('shared', { maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST }),
    },
  ],
  exports: [REDIS_CLIENT, RedisConnectionFactory],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit().catch(() => {
        this.client.disconnect();
      });
    }
  }
}
