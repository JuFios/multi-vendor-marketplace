import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_REQUEST_HEADER = 'x-request-id';
export const CORRELATION_ID_RESPONSE_HEADER = 'X-Request-Id';

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && CORRELATION_ID_PATTERN.test(value);
}

/** Keeps a well-formed client-supplied id, otherwise starts a new one. */
export function resolveCorrelationId(header: string | string[] | undefined): string {
  return isValidCorrelationId(header) ? header : randomUUID();
}
