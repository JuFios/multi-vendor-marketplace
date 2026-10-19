import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { setContextUserId } from '../../../common/cls';
import { IS_PUBLIC_KEY } from '../../../common/decorators';
import { UnauthorizedError } from '../../../common/exceptions';
import type { AuthUser } from '../auth-user';
import { JWT_STRATEGY_NAME } from '../auth.constants';

/** Global guard: every route needs a valid access token unless it is marked `@Public()`. */
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY_NAME) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic === true ? true : (super.canActivate(context) as Promise<boolean>);
  }

  override handleRequest<TUser extends AuthUser = AuthUser>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedError();
    }
    setContextUserId(user.userId);
    return user;
  }
}
