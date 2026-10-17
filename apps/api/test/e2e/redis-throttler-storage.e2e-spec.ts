import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../src/infrastructure/redis';
import { RedisThrottlerStorage } from '../../src/infrastructure/throttling';
import { createTestApp } from '../helpers/test-app';

describe('RedisThrottlerStorage (e2e)', () => {
  let app: INestApplication;
  let redis: Redis;
  let storage: RedisThrottlerStorage;
  let counter = 0;
  const uniqueKey = (): string => `spec-${Date.now()}-${(counter += 1)}`;

  beforeAll(async () => {
    app = await createTestApp();
    redis = app.get<Redis>(REDIS_CLIENT);
    storage = new RedisThrottlerStorage(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  it('counts hits inside the window and blocks the one that exceeds the limit', async () => {
    const key = uniqueKey();

    const first = await storage.increment(key, 60_000, 2, 60_000, 'login');
    const second = await storage.increment(key, 60_000, 2, 60_000, 'login');
    const third = await storage.increment(key, 60_000, 2, 60_000, 'login');

    expect(first).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(second).toMatchObject({ totalHits: 2, isBlocked: false });
    expect(third).toMatchObject({ totalHits: 3, isBlocked: true });
    expect(third.timeToBlockExpire).toBeGreaterThan(0);
    expect(first.timeToExpire).toBeGreaterThan(0);
  });

  it('does not count hits made while blocked', async () => {
    const key = uniqueKey();
    for (let i = 0; i < 3; i += 1) {
      await storage.increment(key, 60_000, 2, 60_000, 'login');
    }

    const whileBlocked = await storage.increment(key, 60_000, 2, 60_000, 'login');

    expect(whileBlocked).toMatchObject({ totalHits: 3, isBlocked: true });
  });

  it('keeps keys and throttler names independent', async () => {
    const key = uniqueKey();
    for (let i = 0; i < 3; i += 1) {
      await storage.increment(key, 60_000, 2, 60_000, 'login');
    }

    const otherName = await storage.increment(key, 60_000, 2, 60_000, 'bid');
    const otherKey = await storage.increment(uniqueKey(), 60_000, 2, 60_000, 'login');

    expect(otherName).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(otherKey).toMatchObject({ totalHits: 1, isBlocked: false });
  });

  it('lets the window expire on its own', async () => {
    const key = uniqueKey();
    await storage.increment(key, 60_000, 5, 60_000, 'login');

    const ttl = await redis.pttl(`throttle:login:${key}`);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});
