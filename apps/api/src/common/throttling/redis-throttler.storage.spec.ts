import { Logger } from '@nestjs/common';
import { Counter } from '@prometheus-io/client';
import type { Redis } from 'ioredis';

import { RedisThrottlerStorage } from './redis-throttler.storage';

function build(evalResult: () => Promise<unknown>): {
  storage: RedisThrottlerStorage;
  failures: Counter<string>;
} {
  const failures = new Counter({
    name: 'throttle_storage_failures_total',
    help: 'Rate-limit storage calls that failed and were answered fail-open.',
    registers: [],
  });
  const redis = { eval: evalResult } as unknown as Redis;
  return { storage: new RedisThrottlerStorage(redis, failures), failures };
}

describe('RedisThrottlerStorage', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('maps the script answer onto the throttler record', async () => {
    const { storage } = build(() => Promise.resolve([3, 45_000, 0, 0]));

    await expect(storage.increment('ip:10.0.0.1', 60_000, 5, 30_000, 'default')).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('reports a blocked caller with the remaining block time', async () => {
    const { storage } = build(() => Promise.resolve([6, 0, 1, 30_000]));

    await expect(storage.increment('ip:10.0.0.1', 60_000, 5, 30_000, 'login')).resolves.toEqual({
      totalHits: 6,
      timeToExpire: 0,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
  });

  it('lets the request through and counts the failure while Redis is unreachable', async () => {
    const { storage, failures } = build(() => Promise.reject(new Error('ECONNREFUSED')));

    await expect(storage.increment('ip:10.0.0.1', 60_000, 5, 30_000, 'login')).resolves.toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect((await failures.get()).values[0]?.value).toBe(1);
  });
});
