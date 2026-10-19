import type { UserRole } from '../users/user-role';

/** Payload of the access JWT; `sellerId` is present only for users with an approved store. */
export interface AccessTokenClaims {
  readonly sub: string;
  readonly roles: readonly UserRole[];
  readonly sellerId?: string;
}

/** The only algorithm access tokens are signed and accepted with. */
export const ACCESS_TOKEN_ALGORITHM = 'HS256';
