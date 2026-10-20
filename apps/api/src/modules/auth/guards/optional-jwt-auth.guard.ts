import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { AuthUser } from '../auth-user';
import { JWT_STRATEGY_NAME } from '../auth.constants';

/**
 * For `@Public()` routes that tell a signed-in caller apart: a valid token sets `request.user`,
 * anything else leaves the caller anonymous instead of failing the request.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {
  override handleRequest<TUser = AuthUser>(_error: unknown, user: TUser | false): TUser {
    return (user || undefined) as TUser;
  }
}
