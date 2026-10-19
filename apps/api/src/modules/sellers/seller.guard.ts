import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { ForbiddenError } from '../../common/exceptions';
import type { AuthUser } from '../auth/auth-user';

import { SellersService } from './sellers.service';

/**
 * Seller-only routes. The token carries the SELLER role and `sellerId`, but both can be stale,
 * so the store must still be approved in the database.
 */
@Injectable()
export class SellerGuard implements CanActivate {
  constructor(private readonly sellers: SellersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const approved =
      !!user?.roles.includes('SELLER') &&
      user.sellerId !== undefined &&
      (await this.sellers.isApproved(user.sellerId));
    if (!approved) {
      throw new ForbiddenError('Only approved sellers can do this', 'SELLER_NOT_APPROVED');
    }
    return true;
  }
}
