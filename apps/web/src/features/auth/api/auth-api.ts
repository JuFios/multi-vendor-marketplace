import { api, unwrap, type SessionResponse } from '../../../lib/api/api';
import type { components } from '../../../lib/api/schema';
import { sessionStore } from '../../../lib/session';

export type RegisterInput = components['schemas']['RegisterDto'];
export type LoginInput = components['schemas']['LoginDto'];
export type ApplyInput = components['schemas']['ApplyForSellerDto'];

function storeSession(session: SessionResponse): SessionResponse {
  sessionStore.setSession({ accessToken: session.accessToken, user: session.user });
  return session;
}

export async function login(input: LoginInput): Promise<SessionResponse> {
  return storeSession(await unwrap(api.POST('/api/auth/login', { body: input })));
}

export async function register(input: RegisterInput): Promise<SessionResponse> {
  return storeSession(await unwrap(api.POST('/api/auth/register', { body: input })));
}

export async function logout(): Promise<void> {
  try {
    await api.POST('/api/auth/logout');
  } finally {
    sessionStore.setSession(null);
  }
}

export function fetchProviders() {
  return unwrap(api.GET('/api/auth/providers'));
}

export function fetchMyApplication() {
  return unwrap(api.GET('/api/sellers/applications/me'));
}

export function submitApplication(input: ApplyInput) {
  return unwrap(api.POST('/api/sellers/applications', { body: input }));
}
