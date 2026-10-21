import { api, unwrap } from '../../lib/api/api';
import { parseApiError } from '../../lib/api/errors';
import type { components } from '../../lib/api/schema';

export type Category = components['schemas']['CategoryResponseDto'];
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OrderStatus = components['schemas']['OrderResponseDto']['status'];

export function fetchApplications(input: { page: number; status?: ApplicationStatus }) {
  return unwrap(
    api.GET('/api/admin/seller-applications', { params: { query: { ...input, limit: 10 } } }),
  );
}

export function approveApplication(id: string) {
  return unwrap(
    api.POST('/api/admin/seller-applications/{id}/approve', { params: { path: { id } } }),
  );
}

export function rejectApplication(input: { id: string; reason: string }) {
  return unwrap(
    api.POST('/api/admin/seller-applications/{id}/reject', {
      params: { path: { id: input.id } },
      body: { reason: input.reason },
    }),
  );
}

export function fetchModerationProducts(input: { page: number; status?: ApplicationStatus }) {
  return unwrap(api.GET('/api/admin/products', { params: { query: { ...input, limit: 10 } } }));
}

export function approveProduct(id: string) {
  return unwrap(api.POST('/api/admin/products/{id}/approve', { params: { path: { id } } }));
}

export function rejectProduct(input: { id: string; reason: string }) {
  return unwrap(
    api.POST('/api/admin/products/{id}/reject', {
      params: { path: { id: input.id } },
      body: { reason: input.reason },
    }),
  );
}

export function createCategory(body: { name: string; slug: string; parentId?: string }) {
  return unwrap(api.POST('/api/admin/categories', { body }));
}

export function updateCategory(input: {
  id: string;
  body: { name?: string; slug?: string; parentId?: string | null };
}) {
  return unwrap(
    api.PATCH('/api/admin/categories/{id}', {
      params: { path: { id: input.id } },
      body: input.body,
    }),
  );
}

export async function deleteCategory(id: string): Promise<void> {
  const { response, error } = await api.DELETE('/api/admin/categories/{id}', {
    params: { path: { id } },
  });
  if (!response.ok) {
    throw parseApiError(response.status, error);
  }
}

export function fetchAdminOrders(input: { page: number; status?: OrderStatus }) {
  return unwrap(api.GET('/api/admin/orders', { params: { query: { ...input, limit: 10 } } }));
}

export function fetchAdminOrder(id: string) {
  return unwrap(api.GET('/api/admin/orders/{id}', { params: { path: { id } } }));
}

export function adminCancelSellerOrder(input: { id: string; reason: string }) {
  return unwrap(
    api.POST('/api/admin/seller-orders/{id}/cancel', {
      params: { path: { id: input.id } },
      body: { reason: input.reason },
    }),
  );
}

export function adminCompleteSellerOrder(id: string) {
  return unwrap(
    api.POST('/api/admin/seller-orders/{id}/status', {
      params: { path: { id } },
      body: { status: 'COMPLETED' },
    }),
  );
}
