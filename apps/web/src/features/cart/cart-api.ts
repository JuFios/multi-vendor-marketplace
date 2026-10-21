import { api, unwrap } from '../../lib/api/api';
import type { components } from '../../lib/api/schema';

export type Cart = components['schemas']['CartResponseDto'];
export type CartGroup = components['schemas']['CartGroupDto'];
export type CartItem = components['schemas']['CartItemDto'];

export function fetchCart() {
  return unwrap(api.GET('/api/cart'));
}

export function setCartQuantity(input: { productId: string; quantity: number }) {
  return unwrap(
    api.PATCH('/api/cart/items/{productId}', {
      params: { path: { productId: input.productId } },
      body: { quantity: input.quantity },
    }),
  );
}

export function removeCartItem(productId: string) {
  return unwrap(api.DELETE('/api/cart/items/{productId}', { params: { path: { productId } } }));
}

export function clearCart() {
  return unwrap(api.DELETE('/api/cart'));
}
