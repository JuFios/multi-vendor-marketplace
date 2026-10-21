import { api, authorizedFetch, unwrap } from '../../lib/api/api';
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

export type Dispute = components['schemas']['DisputeDto'];
export type DisputeStatus = Dispute['status'];
export type ResolveBody = components['schemas']['ResolveDisputeDto'];
export type SalesChart = components['schemas']['SalesChartDto'];
export type AnalyticsSummary = components['schemas']['AnalyticsSummaryDto'];

export function fetchAdminDisputes(input: { page: number; status?: DisputeStatus }) {
  return unwrap(api.GET('/api/admin/disputes', { params: { query: { ...input, limit: 10 } } }));
}

export function reviewDispute(id: string) {
  return unwrap(api.POST('/api/admin/disputes/{id}/review', { params: { path: { id } } }));
}

export function resolveDispute(input: { id: string; key: string; body: ResolveBody }) {
  return unwrap(
    api.POST('/api/admin/disputes/{id}/resolve', {
      params: { path: { id: input.id }, header: { 'Idempotency-Key': input.key } },
      body: input.body,
    }),
  );
}

export const LEDGER_PAGE_SIZE = 20;

export function fetchLedger(input: { page: number; from: string; to: string; sellerId?: string }) {
  return unwrap(
    api.GET('/api/admin/ledger', { params: { query: { ...input, limit: LEDGER_PAGE_SIZE } } }),
  );
}

/** Every approved store, for the store filter and to name the stores in the ledger. */
export function fetchApprovedStores() {
  return unwrap(
    api.GET('/api/admin/seller-applications', {
      params: { query: { status: 'APPROVED', page: 1, limit: 100 } },
    }),
  );
}

export function fetchAnalyticsSummary(input: { from: string; to: string }) {
  return unwrap(api.GET('/api/admin/analytics/summary', { params: { query: input } }));
}

export function fetchSalesChart(days: number) {
  return unwrap(api.GET('/api/admin/analytics/sales-chart', { params: { query: { days } } }));
}

export type ReportFormat = 'csv' | 'json';

/** Downloads the report as a file; the server picks the content by `format`. */
export async function downloadReport(input: { from: string; to: string; format: ReportFormat }) {
  const query = new URLSearchParams(input);
  const response = await authorizedFetch(`/api/admin/analytics/report?${query.toString()}`);
  if (!response.ok) {
    throw parseApiError(response.status, await response.json().catch(() => null));
  }
  return {
    blob: await response.blob(),
    filename: `analytics-report_${input.from}_${input.to}.${input.format}`,
  };
}
