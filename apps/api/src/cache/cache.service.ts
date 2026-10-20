import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Cache } from 'cache-manager';

import { withTimeout } from '../common/utils/with-timeout';
import { CACHE_HITS_TOTAL, CACHE_MISSES_TOTAL } from '../metrics/metrics.constants';

import { CACHE_OPERATION_TIMEOUT_MS } from './cache.constants';

export interface CacheEntry {
  /** Metric label: which cache this is (`product`, `catalog`). */
  readonly cache: string;
  readonly key: string;
  readonly ttlMs: number;
}

/**
 * Redis cache that fails open: when Redis errors or is slow, reads fall through to the source
 * and writes are dropped, with a log line. Values must be JSON-serializable.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly store: Cache,
    @InjectMetric(CACHE_HITS_TOTAL) private readonly hits: Counter<'cache'>,
    @InjectMetric(CACHE_MISSES_TOTAL) private readonly misses: Counter<'cache'>,
  ) {}

  /**
   * The cached value, or the result of `load`, which is then cached unless `shouldStore`
   * says the value is not worth keeping (a degraded answer, say).
   */
  async remember<T>(
    { cache, key, ttlMs }: CacheEntry,
    load: () => Promise<T>,
    shouldStore: (value: T) => boolean = () => true,
  ): Promise<T> {
    const cached = await this.read<T>(cache, key);
    if (cached !== undefined) {
      this.hits.inc({ cache });
      return cached;
    }
    this.misses.inc({ cache });
    const value = await load();
    if (shouldStore(value)) {
      await this.write(cache, key, value, ttlMs);
    }
    return value;
  }

  /** Best-effort delete for the request path: the TTL and the cache consumer cover a failure. */
  async del(key: string): Promise<void> {
    try {
      await this.delOrThrow(key);
    } catch (error) {
      this.logger.warn({ msg: 'cache.del_failed', key, error: messageOf(error) });
    }
  }

  /** Delete that reports failure, for the consumer whose job the queue retries. */
  async delOrThrow(key: string): Promise<void> {
    await withTimeout(this.store.del(key), CACHE_OPERATION_TIMEOUT_MS, 'cache del');
  }

  private async read<T>(cache: string, key: string): Promise<T | undefined> {
    try {
      const value = await withTimeout(
        this.store.get<T>(key),
        CACHE_OPERATION_TIMEOUT_MS,
        'cache get',
      );
      return value ?? undefined;
    } catch (error) {
      this.logger.warn({ msg: 'cache.read_failed', cache, key, error: messageOf(error) });
      return undefined;
    }
  }

  private async write(cache: string, key: string, value: unknown, ttlMs: number): Promise<void> {
    try {
      await withTimeout(this.store.set(key, value, ttlMs), CACHE_OPERATION_TIMEOUT_MS, 'cache set');
    } catch (error) {
      this.logger.warn({ msg: 'cache.write_failed', cache, key, error: messageOf(error) });
    }
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
