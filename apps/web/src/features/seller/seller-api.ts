import { api, unwrap } from '../../lib/api/api';
import { isApiError, parseApiError } from '../../lib/api/errors';
import type { components } from '../../lib/api/schema';

export type SellerProduct = components['schemas']['SellerProductResponseDto'];
export type CreateProductBody = components['schemas']['CreateProductDto'];
export type UpdateProductBody = components['schemas']['UpdateProductDto'];
export type SellerDashboard = components['schemas']['SellerDashboardDto'];

export interface SellerProductFilters {
  page: number;
  type?: 'FIXED_PRICE' | 'AUCTION';
  moderationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export function fetchSellerDashboard() {
  return unwrap(api.GET('/api/seller/dashboard'));
}

export function fetchSellerFinance(range: { from: string; to: string }) {
  return unwrap(api.GET('/api/seller/finance', { params: { query: range } }));
}

export function fetchSellerProducts(filters: SellerProductFilters) {
  return unwrap(api.GET('/api/seller/products', { params: { query: { ...filters, limit: 10 } } }));
}

export function fetchSellerProduct(id: string) {
  return unwrap(api.GET('/api/seller/products/{id}', { params: { path: { id } } }));
}

export function createProduct(body: CreateProductBody) {
  return unwrap(api.POST('/api/seller/products', { body }));
}

export function updateProduct(input: { id: string; body: UpdateProductBody }) {
  return unwrap(
    api.PATCH('/api/seller/products/{id}', {
      params: { path: { id: input.id } },
      body: input.body,
    }),
  );
}

/** Sets the stock decided on `expectedStock`; a sale since then is a PRODUCT_STOCK_CONFLICT. */
export function setProductStock(input: { id: string; stock: number; expectedStock: number }) {
  return unwrap(
    api.PATCH('/api/seller/products/{id}/stock', {
      params: { path: { id: input.id } },
      body: { stock: input.stock, expectedStock: input.expectedStock },
    }),
  );
}

/** The current stock a PRODUCT_STOCK_CONFLICT reports, if the error is one. */
export function conflictingStock(error: unknown): number | null {
  if (!isApiError(error) || error.code !== 'PRODUCT_STOCK_CONFLICT') {
    return null;
  }
  const details = error.details as { stock?: unknown } | undefined;
  return typeof details?.stock === 'number' ? details.stock : null;
}

export async function archiveProduct(id: string): Promise<void> {
  const { response, error } = await api.DELETE('/api/seller/products/{id}', {
    params: { path: { id } },
  });
  if (!response.ok) {
    throw parseApiError(response.status, error);
  }
}

/** The store's auction products: the auctions list carries no titles, so lots are named from here. */
export function fetchAuctionProducts() {
  return unwrap(
    api.GET('/api/seller/products', {
      params: { query: { type: 'AUCTION', page: 1, limit: 100 } },
    }),
  );
}

export function fetchSellerAuctions(page: number) {
  return unwrap(api.GET('/api/seller/auctions', { params: { query: { page, limit: 10 } } }));
}

export type SellerOrderStatus = 'NEW' | 'PROCESSING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';

export function fetchSellerOrders(input: { page: number; status?: SellerOrderStatus }) {
  return unwrap(api.GET('/api/seller/orders', { params: { query: { ...input, limit: 10 } } }));
}

export function fetchSellerOrder(id: string) {
  return unwrap(api.GET('/api/seller/orders/{id}', { params: { path: { id } } }));
}

export function changeSellerOrderStatus(input: { id: string; status: 'PROCESSING' | 'SHIPPED' }) {
  return unwrap(
    api.POST('/api/seller/orders/{id}/status', {
      params: { path: { id: input.id } },
      body: { status: input.status },
    }),
  );
}

export function cancelOwnSellerOrder(input: { id: string; reason: string }) {
  return unwrap(
    api.POST('/api/seller/orders/{id}/cancel', {
      params: { path: { id: input.id } },
      body: { reason: input.reason },
    }),
  );
}

export function refundSellerOrder(input: {
  id: string;
  key: string;
  reason: string;
  items: { sellerOrderItemId: string; quantity: number }[];
}) {
  return unwrap(
    api.POST('/api/seller/orders/{id}/refunds', {
      params: { path: { id: input.id }, header: { 'Idempotency-Key': input.key } },
      body: { items: input.items, reason: input.reason },
    }),
  );
}
