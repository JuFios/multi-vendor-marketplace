import { Injectable } from '@nestjs/common';

import { ProductsService } from '../products';
import { SellersService } from '../sellers';

import { buildCart, type CartLineSource } from './cart';
import { CartRepository } from './cart.repository';
import { CartResponseDto } from './dto/cart-response.dto';

@Injectable()
export class CartService {
  constructor(
    private readonly cart: CartRepository,
    private readonly products: ProductsService,
    private readonly sellers: SellersService,
  ) {}

  /** The user's cart with current prices and stock; no cart yet reads as an empty one. */
  async get(userId: string): Promise<CartResponseDto> {
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
    const storeNames = await this.sellers.findStoreNames([
      ...new Set(lines.map((line) => line.sellerId)),
    ]);
    return CartResponseDto.from(buildCart(lines), storeNames);
  }
}
