import { sessionStore } from '../session';

import { createApiClient, createAuthorizedFetch, unwrap } from './client';
import type { components } from './schema';

export type SessionResponse = components['schemas']['SessionResponseDto'];

/** Exchanges the httpOnly refresh cookie for a new access token; `null` ends the session. */
export function refreshSession(): Promise<string | null> {
  // Rotation treats a second use of the same cookie as theft, so concurrent callers share one call.
  inFlightRefresh ??= acrossTabs(requestRefresh).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

let inFlightRefresh: Promise<string | null> | null = null;

const REFRESH_LOCK = 'marketplace:auth-refresh';

/**
 * Every tab shares the refresh cookie, and two tabs presenting the same one would revoke the
 * session everywhere. A Web Lock makes the tabs take turns: the next one starts only after the
 * previous response has set the rotated cookie. Browsers without the API just run the call.
 */
export async function acrossTabs<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks === undefined ? work() : await locks.request(REFRESH_LOCK, work);
}

async function requestRefresh(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!response.ok) {
      sessionStore.setSession(null);
      return null;
    }
    const session = (await response.json()) as SessionResponse;
    sessionStore.setSession({ accessToken: session.accessToken, user: session.user });
    return session.accessToken;
  } catch {
    // A network failure must not log the user out; the request is simply not retried.
    return null;
  }
}

const authorized = createAuthorizedFetch({
  tokens: {
    getAccessToken: () => sessionStore.getAccessToken(),
    setAccessToken: () => undefined,
  },
  refresh: refreshSession,
});

export const api = createApiClient(authorized.fetch);
/** For responses that are not JSON, e.g. file downloads. */
export const authorizedFetch = authorized.fetch;
export { unwrap };
