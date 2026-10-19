import type { UserRole } from '../users/user-role';

/** The authenticated caller, as `JwtAuthGuard` attaches it to `request.user`. */
export interface AuthUser {
  readonly userId: string;
  readonly roles: readonly UserRole[];
  /** Present once the user has an approved store. */
  readonly sellerId?: string;
}
