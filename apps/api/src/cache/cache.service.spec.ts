import type { Counter } from '@prometheus-io/client';
import type { Cache } from 'cache-manager';

import { CacheService } from './cache.service';

const entry = { cache: 'product', key: 'cache:product:1', ttlMs: 300_000 };

function setup(store: Partial<Record<'get' | 'set' | 'del', jest.Mock>> = {}) {
  const backing = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(true),
    ...store,
  };
  const hits = { inc: jest.fn() };
  const misses = { inc: jest.fn() };
  const service = new CacheService(
    backing as unknown as Cache,
    hits as unknown as Counter<'cache'>,
    misses as unknown as Counter<'cache'>,
  );
  return { service, backing, hits, misses };
}

describe('CacheService', () => {
  it('returns the cached value and counts a hit without loading', async () => {
    const { service, hits, misses } = setup({ get: jest.fn().mockResolvedValue({ id: 1 }) });
    const load = jest.fn();

    await expect(service.remember(entry, load)).resolves.toEqual({ id: 1 });

    expect(load).not.toHaveBeenCalled();
    expect(hits.inc).toHaveBeenCalledWith({ cache: 'product' });
    expect(misses.inc).not.toHaveBeenCalled();
  });

  it('loads on a miss, counts it and stores the value with the TTL', async () => {
    const { service, backing, misses } = setup();

    await expect(service.remember(entry, () => Promise.resolve({ id: 2 }))).resolves.toEqual({
      id: 2,
    });

    expect(misses.inc).toHaveBeenCalledWith({ cache: 'product' });
    expect(backing.set).toHaveBeenCalledWith('cache:product:1', { id: 2 }, 300_000);
  });

  it('does not store a value the caller refuses', async () => {
    const { service, backing } = setup();

    await expect(
      service.remember(
        entry,
        () => Promise.resolve({ degraded: true }),
        (value) => !value.degraded,
      ),
    ).resolves.toEqual({ degraded: true });

    expect(backing.set).not.toHaveBeenCalled();
  });

  it('falls through to the source when the store fails', async () => {
    const { service, misses } = setup({
      get: jest.fn().mockRejectedValue(new Error('down')),
      set: jest.fn().mockRejectedValue(new Error('down')),
    });

    await expect(service.remember(entry, () => Promise.resolve('fresh'))).resolves.toBe('fresh');

    expect(misses.inc).toHaveBeenCalled();
  });

  it('does not wait for a store that never answers', async () => {
    jest.useFakeTimers();
    try {
      const { service } = setup({ get: jest.fn().mockReturnValue(new Promise(() => undefined)) });
      const result = service.remember(entry, () => Promise.resolve('fresh'));
      await jest.advanceTimersByTimeAsync(1_000);
      await expect(result).resolves.toBe('fresh');
    } finally {
      jest.useRealTimers();
    }
  });

  it('swallows a failed delete on the request path but reports it to the consumer', async () => {
    const { service } = setup({ del: jest.fn().mockRejectedValue(new Error('down')) });

    await expect(service.del('cache:product:1')).resolves.toBeUndefined();
    await expect(service.delOrThrow('cache:product:1')).rejects.toThrow('down');
  });
});
