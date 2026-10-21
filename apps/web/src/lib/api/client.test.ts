import { describe, expect, it, vi } from 'vitest';

import { createAuthorizedFetch } from './client';

describe('createAuthorizedFetch', () => {
  it('shares one refresh between parallel 401 responses and retries with the new token', async () => {
    let token: string | null = 'expired';
    const refresh = vi.fn(async () => {
      await Promise.resolve();
      token = 'fresh';
      return token;
    });
    const nativeFetch = vi.fn((input: Request | string | URL) => {
      const request = input as Request;
      const bearer = request.headers.get('Authorization');
      return Promise.resolve(new Response(null, { status: bearer === 'Bearer fresh' ? 200 : 401 }));
    });

    const { fetch: authorized } = createAuthorizedFetch({
      tokens: { getAccessToken: () => token, setAccessToken: (next) => (token = next) },
      refresh,
      fetchImpl: nativeFetch,
    });

    const [a, b] = await Promise.all([
      authorized('http://localhost/api/cart'),
      authorized('http://localhost/api/orders'),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('returns the 401 when the refresh yields no token', async () => {
    const { fetch: authorized } = createAuthorizedFetch({
      tokens: { getAccessToken: () => 'old', setAccessToken: () => undefined },
      refresh: () => Promise.resolve(null),
      fetchImpl: (() => Promise.resolve(new Response(null, { status: 401 }))),
    });

    const response = await authorized('http://localhost/api/cart');

    expect(response.status).toBe(401);
  });
});
