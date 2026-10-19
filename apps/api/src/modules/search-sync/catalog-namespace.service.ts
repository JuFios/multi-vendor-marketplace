import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../redis';

import { CATALOG_NAMESPACE_KEY } from './search-sync.constants';

/**
 * The version of the cached catalog: every cached page is keyed by it, so raising it after the
 * index changed retires all pages at once without deleting them.
 */
@Injectable()
export class CatalogNamespace {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** The current version, as part of a cache key; fails when Redis is unreachable. */
  async current(): Promise<string> {
    return (await this.redis.get(CATALOG_NAMESPACE_KEY)) ?? '0';
  }

  async bump(): Promise<void> {
    await this.redis.incr(CATALOG_NAMESPACE_KEY);
  }
}
