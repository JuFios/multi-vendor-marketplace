import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import { APP_CONFIG, type AppConfig } from '../../config/app-config';

export interface RedisConnectionOptions {
  /** BullMQ requires `null`; the shared client uses a small finite value. */
  maxRetriesPerRequest?: number | null;
}

/**
 * Creates dedicated connections to the same Redis. Callers own the lifecycle of
 * what they create; blocking consumers (BullMQ) and subscribers must not share
 * the general-purpose client.
 */
@Injectable()
export class RedisConnectionFactory {
  private readonly logger = new Logger('Redis');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  create(purpose: string, options: RedisConnectionOptions = {}): Redis {
    const connection = new Redis(this.config.redis.url, {
      connectionName: `marketplace:${purpose}`,
      ...options,
    });
    connection.on('error', (error: Error) => {
      this.logger.error(`connection "${purpose}" error: ${error.message}`);
    });
    return connection;
  }
}
