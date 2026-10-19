import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma';

export interface CartItemRow {
  readonly productId: string;
  readonly quantity: number;
}

/** Owns `carts` and `cart_items`; every read is scoped to the caller's own ACTIVE cart. */
@Injectable()
export class CartRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /** The items of the user's ACTIVE cart, oldest first; none when there is no cart yet. */
  async listItems(userId: string): Promise<CartItemRow[]> {
    const rows = await this.txHost.tx.cartItem.findMany({
      where: { cart: { userId, status: 'ACTIVE' } },
      select: { productId: true, quantity: true },
      orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
    });
    return rows;
  }
}
