import { api, unwrap } from '../../lib/api/api';
import type { components } from '../../lib/api/schema';

export type Order = components['schemas']['OrderResponseDto'];
export type SellerOrder = components['schemas']['SellerOrderDto'];

export function checkout(key: string) {
  return unwrap(
    api.POST('/api/orders/checkout', { params: { header: { 'Idempotency-Key': key } } }),
  );
}

export function fetchOrders(page: number) {
  return unwrap(api.GET('/api/orders', { params: { query: { page, limit: 10 } } }));
}

export function fetchOrder(id: string) {
  return unwrap(api.GET('/api/orders/{id}', { params: { path: { id } } }));
}

export function cancelSellerOrder(input: { orderId: string; sellerOrderId: string }) {
  return unwrap(
    api.POST('/api/orders/{orderId}/seller-orders/{soId}/cancel', {
      params: { path: { orderId: input.orderId, soId: input.sellerOrderId } },
    }),
  );
}

export function confirmReceipt(input: { orderId: string; sellerOrderId: string }) {
  return unwrap(
    api.POST('/api/orders/{orderId}/seller-orders/{soId}/confirm-receipt', {
      params: { path: { orderId: input.orderId, soId: input.sellerOrderId } },
    }),
  );
}
