import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '../../users/user-role';

export const ROLES_KEY = 'marketplace:roles';

/** Allows the route only to users holding at least one of the given roles. */
export const Roles = (...roles: readonly UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
