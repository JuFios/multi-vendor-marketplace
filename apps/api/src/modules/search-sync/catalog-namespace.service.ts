import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import type { Redis } from 'ioredis';

import { searchConfig } from '../../config/search.config';
import { REDIS_CLIENT } from '../../redis/redis.constants';

import { CATALOG_BUMP_PENDING_KEY, CATALOG_NAMESPACE_KEY } from './search-sync.constants';

/**
 * The version of the cached catalog: every cached page is keyed by it, so raising it after the
 * index changed retires all pages at once without deleting them.
 */
@Injectable()
export class CatalogNamespace implements OnModuleDestroy {
  private readonly logger = new Logger(CatalogNamespace.name);
  private scheduled: NodeJS.Timeout | undefined;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(searchConfig.KEY) private readonly settings: ConfigType<typeof searchConfig>,
  ) {}

  /** The current version, as part of a cache key; fails when Redis is unreachable. */
  async current(): Promise<string> {
    return (await this.redis.get(CATALOG_NAMESPACE_KEY)) ?? '0';
  }

  async bump(): Promise<void> {
    await this.redis.incr(CATALOG_NAMESPACE_KEY);
  }

  /**
   * Raises the version at the end of a short window, once for every index change in it across all
   * workers: the first change claims the window in Redis and schedules the bump, later ones ride
   * along. A busy auction thus retires the cached pages a few times a second, not once per bid.
   * A bump lost with a crashed worker is bounded by the pages' own TTL.
   */
  async bumpSoon(): Promise<void> {
    const windowMs = this.settings.catalogBumpWindowMs;
    if (windowMs === 0) {
      await this.bump();
      return;
    }
    const claimed = await this.redis.set(CATALOG_BUMP_PENDING_KEY, '1', 'PX', windowMs, 'NX');
    if (claimed === null || this.scheduled !== undefined) {
      return;
    }
    this.scheduled = setTimeout(() => {
      void this.flush();
    }, windowMs);
  }

  /** Applies a scheduled bump now, so a worker that stops does not take it along. */
  async onModuleDestroy(): Promise<void> {
    if (this.scheduled !== undefined) {
      clearTimeout(this.scheduled);
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    this.scheduled = undefined;
    try {
      await this.bump();
    } catch (error) {
      this.logger.warn({
        msg: 'catalog.namespace_bump_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
