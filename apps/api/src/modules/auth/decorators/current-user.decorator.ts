import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthUser } from '../auth-user';

/** The authenticated `AuthUser`; only meaningful on routes that are not `@Public()`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
