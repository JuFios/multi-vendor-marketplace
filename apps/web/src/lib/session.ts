import type { components } from './api/schema';

export type SessionUser = components['schemas']['SessionUserDto'];
export type UserRole = SessionUser['roles'][number];

type Listener = () => void;

let accessToken: string | null = null;
let user: SessionUser | null = null;
const listeners = new Set<Listener>();

export const sessionStore = {
  getAccessToken(): string | null {
    return accessToken;
  },
  getUser(): SessionUser | null {
    return user;
  },
  setSession(next: { accessToken: string; user: SessionUser } | null): void {
    accessToken = next?.accessToken ?? null;
    user = next?.user ?? null;
    listeners.forEach((listener) => {
      listener();
    });
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function hasRole(roles: readonly UserRole[] | undefined, role: UserRole): boolean {
  return roles?.includes(role) === true;
}
