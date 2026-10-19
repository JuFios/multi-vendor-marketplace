import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import type { Meilisearch } from 'meilisearch';

import type { PrismaService } from '../prisma';

import { DependencyHealthIndicators } from './dependency-health.indicators';

function build(overrides: {
  query?: () => Promise<unknown>;
  ping?: () => Promise<string>;
  health?: () => Promise<unknown>;
}): DependencyHealthIndicators {
  return new DependencyHealthIndicators(
    new HealthIndicatorService(),
    {
      $queryRaw: overrides.query ?? (() => Promise.resolve([{ '?column?': 1 }])),
    } as never as PrismaService,
    { ping: overrides.ping ?? (() => Promise.resolve('PONG')) } as unknown as Redis,
    {
      health: overrides.health ?? (() => Promise.resolve({ status: 'available' })),
    } as unknown as Meilisearch,
  );
}

describe('DependencyHealthIndicators', () => {
  it('reports every dependency up when probes succeed', async () => {
    const indicators = build({});

    await expect(indicators.database()).resolves.toEqual({ database: { status: 'up' } });
    await expect(indicators.redisConnection()).resolves.toEqual({ redis: { status: 'up' } });
    await expect(indicators.search()).resolves.toEqual({ search: { status: 'up' } });
  });

  it('reports a dependency down with the failure message', async () => {
    const indicators = build({ ping: () => Promise.reject(new Error('ECONNREFUSED')) });

    await expect(indicators.redisConnection()).resolves.toEqual({
      redis: { status: 'down', message: 'ECONNREFUSED' },
    });
  });
});
