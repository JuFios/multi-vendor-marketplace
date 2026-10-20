import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import type { Meilisearch } from 'meilisearch';

import { withTimeout } from '../common/utils/with-timeout';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { MEILI_CLIENT } from '../search/meili.constants';

import { DEPENDENCY_CHECK_TIMEOUT_MS } from './health.constants';

@Injectable()
export class DependencyHealthIndicators {
  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(MEILI_CLIENT) private readonly meili: Meilisearch,
  ) {}

  database(): Promise<HealthIndicatorResult<'database'>> {
    return this.probe('database', () => this.prisma.$queryRaw`SELECT 1`);
  }

  redisConnection(): Promise<HealthIndicatorResult<'redis'>> {
    return this.probe('redis', () => this.redis.ping());
  }

  search(): Promise<HealthIndicatorResult<'search'>> {
    return this.probe('search', () => this.meili.health());
  }

  private async probe<const Key extends string>(
    key: Key,
    check: () => Promise<unknown>,
  ): Promise<HealthIndicatorResult<Key>> {
    const session = this.indicators.check(key);
    try {
      await withTimeout(check(), DEPENDENCY_CHECK_TIMEOUT_MS, key);
      return session.up();
    } catch (error) {
      return session.down(error instanceof Error ? error.message : 'unreachable');
    }
  }
}
