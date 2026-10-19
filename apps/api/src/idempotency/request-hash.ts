import { createHash } from 'node:crypto';

import { canonicalJson } from './canonical-json';

export interface HashedRequest {
  method: string;
  /** Route template, e.g. `/api/orders/:id/refunds`. */
  route: string;
  params: unknown;
  body: unknown;
}

/** Fingerprint of a request: the same key may only be replayed with the same fingerprint. */
export function computeRequestHash({ method, route, params, body }: HashedRequest): string {
  const material = [method.toUpperCase(), route, canonicalJson(params), canonicalJson(body)].join(
    '\n',
  );
  return createHash('sha256').update(material).digest('hex');
}
