import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Public } from '../../../common/decorators';
import { UnauthorizedError } from '../../../common/exceptions';
import type { AuthUser } from '../auth-user';

import { JwtAuthGuard } from './jwt-auth.guard';

class Controller {
  @Public()
  open(): void {
    return undefined;
  }
}

const contextFor = (handler: keyof Controller): ExecutionContext =>
  ({
    getHandler: () => (Controller.prototype as unknown as Record<string, () => void>)[handler],
    getClass: () => Controller,
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(new Reflector());

  it('lets @Public() routes through without authentication', () => {
    expect(guard.canActivate(contextFor('open'))).toBe(true);
  });

  it('turns a failed authentication into UNAUTHORIZED', () => {
    expect(() => guard.handleRequest(null, false)).toThrow(UnauthorizedError);
    expect(() => guard.handleRequest(new Error('jwt expired'), false)).toThrow(UnauthorizedError);
  });

  it('hands the authenticated user through', () => {
    const user: AuthUser = { userId: 'u-1', roles: ['CUSTOMER'] };

    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
