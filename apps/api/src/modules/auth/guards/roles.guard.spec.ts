import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ForbiddenError } from '../../../common/exceptions';
import type { AuthUser } from '../auth-user';
import { Roles } from '../decorators/roles.decorator';

import { RolesGuard } from './roles.guard';

class Controller {
  @Roles('ADMIN')
  adminOnly(): void {
    return undefined;
  }

  @Roles('SELLER', 'ADMIN')
  sellerOrAdmin(): void {
    return undefined;
  }

  open(): void {
    return undefined;
  }
}

function contextFor(handler: keyof Controller, user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => (Controller.prototype as unknown as Record<string, () => void>)[handler],
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const asUser = (...roles: AuthUser['roles'][number][]): AuthUser => ({ userId: 'u-1', roles });

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('lets any caller through a route without @Roles', () => {
    expect(guard.canActivate(contextFor('open', asUser('CUSTOMER')))).toBe(true);
  });

  it('allows a user holding the required role', () => {
    expect(guard.canActivate(contextFor('adminOnly', asUser('CUSTOMER', 'ADMIN')))).toBe(true);
  });

  it('allows a user holding any one of several roles', () => {
    expect(guard.canActivate(contextFor('sellerOrAdmin', asUser('SELLER')))).toBe(true);
  });

  it('rejects a user without the role with FORBIDDEN', () => {
    expect(() => guard.canActivate(contextFor('adminOnly', asUser('CUSTOMER')))).toThrow(
      ForbiddenError,
    );
  });

  it('rejects when there is no authenticated user', () => {
    expect(() => guard.canActivate(contextFor('adminOnly'))).toThrow(ForbiddenError);
  });
});
