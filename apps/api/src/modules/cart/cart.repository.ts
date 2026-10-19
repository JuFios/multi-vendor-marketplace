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

  /**
   * The ACTIVE cart's id, locking the row so one user's cart changes run one at a time.
   * Created on first use (the partial unique index keeps it to one per user).
   */
  async lockOrCreateActive(userId: string): Promise<string> {
    await this.txHost.tx.$executeRaw`
      INSERT INTO carts (id, user_id, status, created_at, updated_at)
      VALUES (gen_random_uuid(), ${userId}::uuid, 'ACTIVE', now(), now())
      ON CONFLICT (user_id) WHERE status = 'ACTIVE' DO NOTHING`;
    const cartId = await this.lockActive(userId);
    if (cartId === null) {
      throw new Error('The active cart disappeared inside the transaction');
    }
    return cartId;
  }

  /** The ACTIVE cart's id, locked, or null when the user has none. */
  async lockActive(userId: string): Promise<string | null> {
    const rows = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM carts WHERE user_id = ${userId}::uuid AND status = 'ACTIVE' FOR UPDATE`;
    return rows[0]?.id ?? null;
  }

  async findQuantity(cartId: string, productId: string): Promise<number | null> {
    const row = await this.txHost.tx.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId } },
      select: { quantity: true },
    });
    return row?.quantity ?? null;
  }

  async setQuantity(cartId: string, productId: string, quantity: number): Promise<void> {
    await this.txHost.tx.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      create: { cartId, productId, quantity },
      update: { quantity },
    });
  }

  /** Stamps the cart the first time it gets an item; conversion analytics count from it. */
  async markFirstItemAdded(cartId: string): Promise<void> {
    await this.txHost.tx.cart.updateMany({
      where: { id: cartId, firstItemAddedAt: null },
      data: { firstItemAddedAt: new Date() },
    });
  }

  async deleteItem(cartId: string, productId: string): Promise<boolean> {
    const { count } = await this.txHost.tx.cartItem.deleteMany({ where: { cartId, productId } });
    return count > 0;
  }

  async clear(cartId: string): Promise<void> {
    await this.txHost.tx.cartItem.deleteMany({ where: { cartId } });
  }

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
