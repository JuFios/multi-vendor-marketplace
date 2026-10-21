import { api, unwrap } from '../../lib/api/api';
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

export function setProductStock(input: { id: string; stock: number }) {
  return unwrap(
    api.PATCH('/api/seller/products/{id}/stock', {
      params: { path: { id: input.id } },
      body: { stock: input.stock },
    }),
  );
}

export async function archiveProduct(id: string): Promise<void> {
  const { response, error } = await api.DELETE('/api/seller/products/{id}', {
    params: { path: { id } },
  });
  if (!response.ok) {
    const { parseApiError } = await import('../../lib/api/errors');
    throw parseApiError(response.status, error);
  }
}

export function fetchSellerAuctions(page: number) {
  return unwrap(api.GET('/api/seller/auctions', { params: { query: { page, limit: 10 } } }));
}
