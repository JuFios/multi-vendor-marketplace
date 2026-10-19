import { ApiProperty } from '@nestjs/swagger';

import { CART_AVAILABILITIES, type CartAvailability, type CartView } from '../cart';

class CartSellerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

class CartItemDto {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'The current price, in kopecks.' })
  unitPriceCents: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ description: 'The current stock.' })
  stock: number;

  @ApiProperty({ enum: CART_AVAILABILITIES })
  availability: CartAvailability;

  @ApiProperty()
  lineTotalCents: number;
}

class CartGroupDto {
  @ApiProperty({ type: CartSellerDto })
  seller: CartSellerDto;

  @ApiProperty({ type: [CartItemDto] })
  items: CartItemDto[];

  @ApiProperty()
  subtotalCents: number;
}

/** The whole cart, grouped by seller; every cart mutation answers with it. */
export class CartResponseDto {
  @ApiProperty({ type: [CartGroupDto] })
  groups: CartGroupDto[];

  @ApiProperty()
  totalCents: number;

  @ApiProperty({ description: 'The sum of all quantities.' })
  itemsCount: number;

  @ApiProperty()
  sellerCount: number;

  static from(cart: CartView, storeNames: ReadonlyMap<string, string>): CartResponseDto {
    return {
      groups: cart.groups.map((group) => ({
        seller: { id: group.sellerId, name: storeNames.get(group.sellerId) ?? '' },
        items: group.items.map((item) => ({ ...item })),
        subtotalCents: group.subtotalCents,
      })),
      totalCents: cart.totalCents,
      itemsCount: cart.itemsCount,
      sellerCount: cart.sellerCount,
    };
  }
}
