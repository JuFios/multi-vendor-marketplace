import createClient from 'openapi-fetch';

import { parseApiError } from './errors';
import type { paths } from './schema';

const AUTH_PATH_PREFIX = '/api/auth/';

export interface TokenStore {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
}

export type RefreshFn = () => Promise<string | null>;

export function createAuthorizedFetch(options: {
  tokens: TokenStore;
  refresh: RefreshFn;
  fetchImpl?: typeof fetch;
}): { fetch: typeof fetch; flushRefresh: () => Promise<string | null> } {
  const nativeFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  let inFlight: Promise<string | null> | null = null;

  const flushRefresh = (): Promise<string | null> => {
    inFlight ??= options.refresh().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const authorizedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.headers.has('X-Requested-With')) {
      request.headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    const token = options.tokens.getAccessToken();
    if (token !== null && !request.headers.has('Authorization')) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }

    const first = request.clone();
    const response = await nativeFetch(first);
    const path = new URL(request.url, 'http://local').pathname;
    if (response.status !== 401 || path.startsWith(AUTH_PATH_PREFIX)) {
      return response;
    }

    const nextToken = await flushRefresh();
    if (nextToken === null) {
      return response;
    }
    const retry = request.clone();
    retry.headers.set('Authorization', `Bearer ${nextToken}`);
    return nativeFetch(retry);
  };

  return { fetch: authorizedFetch, flushRefresh };
}

export function createApiClient(authorizedFetch: typeof fetch) {
  return createClient<paths>({
    baseUrl: '',
    credentials: 'include',
    fetch: authorizedFetch,
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

export async function unwrap<T>(
  result: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await result;
  if (!response.ok) {
    throw parseApiError(response.status, error);
  }
  return data as T;
}
