import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma/transaction';
import { ProductsService } from '../products/products.service';
import { SellersService } from '../sellers/sellers.service';

import {
  availabilityOf,
  buildCart,
  CART_MAX_QUANTITY,
  type CartLineSource,
  type CheckoutLine,
} from './cart';
import {
  CannotBuyOwnProductError,
  CartInsufficientStockError,
  CartItemNotFoundError,
  CartProductNotFixedPriceError,
  CartQuantityLimitError,
} from './cart.errors';
import { CartRepository } from './cart.repository';
import { CartResponseDto } from './dto/cart-response.dto';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly cart: CartRepository,
    private readonly products: ProductsService,
    private readonly sellers: SellersService,
  ) {}

  /** Adds `quantity` to the line, creating the cart and the line on first use. */
  async addItem(userId: string, productId: string, quantity: number): Promise<CartResponseDto> {
    const product = await this.products.getPublicStock(productId);
    if (product.type !== 'FIXED_PRICE') {
      throw new CartProductNotFixedPriceError();
    }
    if ((await this.sellers.findApprovedSellerId(userId)) === product.sellerId) {
      throw new CannotBuyOwnProductError();
    }
    await this.txHost.withTransaction(async () => {
      const cartId = await this.cart.lockOrCreateActive(userId);
      const next = ((await this.cart.findQuantity(cartId, productId)) ?? 0) + quantity;
      if (next > CART_MAX_QUANTITY) {
        throw new CartQuantityLimitError(CART_MAX_QUANTITY);
      }
      if (next > product.stock) {
        throw new CartInsufficientStockError(product.stock);
      }
      await this.cart.setQuantity(cartId, productId, next);
      await this.cart.markFirstItemAdded(cartId);
    });
    this.logger.log({ msg: 'cart.item_added', userId, productId, quantity });
    return this.get(userId);
  }

  /** Sets the line's quantity; lowering it always works, so a broken line can be fixed. */
  async setQuantity(userId: string, productId: string, quantity: number): Promise<CartResponseDto> {
    await this.txHost.withTransaction(async () => {
      const cartId = await this.cart.lockActive(userId);
      const current = cartId === null ? null : await this.cart.findQuantity(cartId, productId);
      if (cartId === null || current === null) {
        throw new CartItemNotFoundError();
      }
      if (quantity > current) {
        const product = await this.products.getPublicStock(productId);
        if (quantity > product.stock) {
          throw new CartInsufficientStockError(product.stock);
        }
      }
      await this.cart.setQuantity(cartId, productId, quantity);
    });
    this.logger.log({ msg: 'cart.quantity_set', userId, productId, quantity });
    return this.get(userId);
  }

  async removeItem(userId: string, productId: string): Promise<CartResponseDto> {
    await this.txHost.withTransaction(async () => {
      const cartId = await this.cart.lockActive(userId);
      if (cartId === null || !(await this.cart.deleteItem(cartId, productId))) {
        throw new CartItemNotFoundError();
      }
    });
    this.logger.log({ msg: 'cart.item_removed', userId, productId });
    return this.get(userId);
  }

  async clear(userId: string): Promise<CartResponseDto> {
    await this.txHost.withTransaction(async () => {
      const cartId = await this.cart.lockActive(userId);
      if (cartId !== null) {
        await this.cart.clear(cartId);
      }
    });
    this.logger.log({ msg: 'cart.cleared', userId });
    return this.get(userId);
  }

  /** The user's cart with current prices and stock; no cart yet reads as an empty one. */
  async get(userId: string): Promise<CartResponseDto> {
    const lines = await this.loadLines(userId);
    const storeNames = await this.sellers.findStoreNames([
      ...new Set(lines.map((line) => line.sellerId)),
    ]);
    return CartResponseDto.from(buildCart(lines), storeNames);
  }

  /**
   * Locks the user's ACTIVE cart for the rest of the transaction and reads its lines, so two
   * checkouts of one cart run one after the other. Null when there is no cart.
   */
  async lockActiveLines(userId: string): Promise<{ cartId: string; lines: CheckoutLine[] } | null> {
    const cartId = await this.cart.lockActive(userId);
    if (cartId === null) {
      return null;
    }
    const lines = await this.loadLines(userId);
    return {
      cartId,
      lines: lines.map((line) => ({ ...line, availability: availabilityOf(line) })),
    };
  }

  /** Marks the cart as turned into an order; part of the checkout transaction. */
  convert(cartId: string, orderId: string): Promise<void> {
    return this.cart.markConverted(cartId, orderId);
  }

  private async loadLines(userId: string): Promise<CartLineSource[]> {
    const items = await this.cart.listItems(userId);
    const products = new Map(
      (await this.products.findByIds(items.map((item) => item.productId))).map((product) => [
        product.id,
        product,
      ]),
    );
    const lines: CartLineSource[] = [];
    for (const item of items) {
      const product = products.get(item.productId);
      if (product) {
        lines.push({
          productId: product.id,
          sellerId: product.sellerId,
          title: product.title,
          type: product.type,
          priceCents: product.priceCents,
          stock: product.stock,
          isPublished: product.isPublished,
          archivedAt: product.archivedAt,
          quantity: item.quantity,
        });
      }
    }
    return lines;
  }
}
