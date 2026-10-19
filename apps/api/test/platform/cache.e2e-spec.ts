import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';
import request from 'supertest';

import { CacheModule, CacheService } from '../../src/cache';
import { REDIS_CLIENT } from '../../src/redis';
import { createTestApp } from '../utils/test-app';

describe('cache (e2e)', () => {
  let app: NestExpressApplication;
  let cache: CacheService;
  let redis: Redis;

  const entry = { cache: 'spec', key: 'cache:spec:item', ttlMs: 60_000 };

  const scrape = async (): Promise<string> =>
    (await request(app.getHttpServer()).get('/metrics')).text;

  beforeAll(async () => {
    app = await createTestApp([], { imports: [CacheModule], worker: false });
    cache = app.get(CacheService);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  beforeEach(async () => {
    await cache.del(entry.key);
  });

  afterAll(async () => {
    await cache.del(entry.key);
    await app.close();
  });

  it('serves the second read from Redis under a namespaced key and counts hit and miss', async () => {
    const load = jest.fn().mockResolvedValue({ value: 1 });

    await cache.remember(entry, load);
    const second = await cache.remember(entry, load);

    expect(second).toEqual({ value: 1 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(await redis.exists('cache:spec:item')).toBe(1);
    const metrics = await scrape();
    expect(metrics).toContain('cache_hits_total{cache="spec"} 1');
    expect(metrics).toContain('cache_misses_total{cache="spec"} 1');
  });

  it('loads again after the key is deleted', async () => {
    const load = jest.fn().mockResolvedValue({ value: 2 });
    await cache.remember(entry, load);

    await cache.delOrThrow(entry.key);
    await cache.remember(entry, load);

    expect(load).toHaveBeenCalledTimes(2);
  });
});
