import type { ConfigType } from '@nestjs/config';
import type { Redis } from 'ioredis';

import type { searchConfig } from '../../config/search.config';

import { CatalogNamespace } from './catalog-namespace.service';
import { CATALOG_NAMESPACE_KEY } from './search-sync.constants';

/** The Redis commands the namespace uses, with `SET NX PX` honouring the expiry on fake time. */
class FakeRedis {
  readonly values = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  incr(key: string): Promise<number> {
    const next = Number(this.live(key)?.value ?? 0) + 1;
    this.values.set(key, { value: String(next), expiresAt: Infinity });
    return Promise.resolve(next);
  }

  set(key: string, value: string, _px: 'PX', ttlMs: number, _nx: 'NX'): Promise<'OK' | null> {
    if (this.live(key) !== undefined) {
      return Promise.resolve(null);
    }
    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
    return Promise.resolve('OK');
  }

  private live(key: string): { value: string; expiresAt: number } | undefined {
    const entry = this.values.get(key);
    return entry !== undefined && entry.expiresAt > Date.now() ? entry : undefined;
  }
}

const namespaceOf = (redis: FakeRedis, catalogBumpWindowMs: number) =>
  new CatalogNamespace(
    redis as unknown as Redis,
    {
      catalogBumpWindowMs,
    } as ConfigType<typeof searchConfig>,
  );

const versionOf = async (redis: FakeRedis) => Number(await redis.get(CATALOG_NAMESPACE_KEY));

describe('CatalogNamespace.bumpSoon', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('bumps at once when the window is 0', async () => {
    const redis = new FakeRedis();

    await namespaceOf(redis, 0).bumpSoon();

    expect(await versionOf(redis)).toBe(1);
  });

  it('bumps once at the end of the window for a burst on several workers', async () => {
    const redis = new FakeRedis();
    const workers = [namespaceOf(redis, 500), namespaceOf(redis, 500)];

    for (let i = 0; i < 20; i += 1) {
      await workers[i % 2]?.bumpSoon();
      await jest.advanceTimersByTimeAsync(10);
    }
    expect(await versionOf(redis)).toBe(0);

    await jest.advanceTimersByTimeAsync(500);
    expect(await versionOf(redis)).toBe(1);
  });

  it('opens a new window for a change after the bump', async () => {
    const redis = new FakeRedis();
    const namespace = namespaceOf(redis, 500);

    await namespace.bumpSoon();
    await jest.advanceTimersByTimeAsync(500);
    await namespace.bumpSoon();
    await jest.advanceTimersByTimeAsync(500);

    expect(await versionOf(redis)).toBe(2);
  });

  it('applies a scheduled bump when the worker stops', async () => {
    const redis = new FakeRedis();
    const namespace = namespaceOf(redis, 500);

    await namespace.bumpSoon();
    await namespace.onModuleDestroy();

    expect(await versionOf(redis)).toBe(1);
  });
});
