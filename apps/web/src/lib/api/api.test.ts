import { afterEach, describe, expect, it, vi } from 'vitest';

import { acrossTabs } from './api';

describe('acrossTabs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs the refresh under one Web Lock shared by every tab', async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    vi.stubGlobal('navigator', { locks: { request } });

    await expect(acrossTabs(() => Promise.resolve('token'))).resolves.toBe('token');

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe('marketplace:auth-refresh');
  });

  it('just runs the refresh where Web Locks are missing', async () => {
    vi.stubGlobal('navigator', {});

    await expect(acrossTabs(() => Promise.resolve('token'))).resolves.toBe('token');
  });
});
