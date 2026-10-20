import type { UserRole } from '../users/user-role';

import type { AccessTokenClaims } from './access-claims';

/** The authenticated caller, as `JwtAuthGuard` attaches it to `request.user`. */
export interface AuthUser {
  readonly userId: string;
  readonly roles: readonly UserRole[];
  /** Present once the user has an approved store. */
  readonly sellerId?: string;
}

/** The caller a verified token stands for, or null when it lacks a subject or roles. */
export function authUserFromClaims(claims: Partial<AccessTokenClaims>): AuthUser | null {
  if (typeof claims.sub !== 'string' || !Array.isArray(claims.roles)) {
    return null;
  }
  return {
    userId: claims.sub,
    roles: claims.roles,
    ...(typeof claims.sellerId === 'string' ? { sellerId: claims.sellerId } : {}),
  };
}
