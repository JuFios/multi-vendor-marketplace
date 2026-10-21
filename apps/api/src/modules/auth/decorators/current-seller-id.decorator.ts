import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { ForbiddenError } from '../../../common/exceptions/app-error';
import type { AuthUser } from '../auth-user';

/** The store id of an approved seller; `SellerGuard` checks approval on seller routes. */
export const CurrentSellerId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (user?.sellerId === undefined) {
      throw new ForbiddenError('Only approved sellers can do this', 'SELLER_NOT_APPROVED');
    }
    return user.sellerId;
  },
);
