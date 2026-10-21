export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  correlationId?: string | undefined;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  readonly correlationId: string | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.correlationId = body.correlationId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseApiError(status: number, payload: unknown): ApiError {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string') {
    return new ApiError(status, {
      code: payload.error.code,
      message: typeof payload.error.message === 'string' ? payload.error.message : 'Request failed',
      details: payload.error.details,
      correlationId:
        typeof payload.error.correlationId === 'string' ? payload.error.correlationId : undefined,
    });
  }
  return new ApiError(status, { code: 'UNKNOWN', message: 'Request failed' });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export interface CheckoutUnavailableItem {
  productId: string;
  reason: 'UNAVAILABLE' | 'INSUFFICIENT_STOCK';
}

export function checkoutUnavailableItems(error: ApiError): CheckoutUnavailableItem[] {
  if (error.code !== 'CART_ITEMS_UNAVAILABLE' || !isRecord(error.details)) {
    return [];
  }
  const items = error.details.items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item) => {
    if (!isRecord(item) || typeof item.productId !== 'string') {
      return [];
    }
    const reason = item.reason === 'INSUFFICIENT_STOCK' ? 'INSUFFICIENT_STOCK' : 'UNAVAILABLE';
    return [{ productId: item.productId, reason }];
  });
}
