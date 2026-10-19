import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ForbiddenError } from '../../../common/exceptions';
import type { UserRole } from '../../users/user-role';
import type { AuthUser } from '../auth-user';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user?.roles.some((role) => required.includes(role))) {
      throw new ForbiddenError();
    }
    return true;
  }
}
