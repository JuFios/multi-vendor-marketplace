export const IDEMPOTENT_SCOPE_METADATA = Symbol('IDEMPOTENT_SCOPE');

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_REPLAY_HEADER = 'Idempotent-Replayed';

/** The client operations that accept an Idempotency-Key; part of the key's uniqueness. */
export const IDEMPOTENCY_SCOPE = {
  CHECKOUT: 'checkout',
  BID: 'bid',
  REFUND: 'refund',
  DISPUTE_RESOLVE: 'dispute-resolve',
} as const;

export type IdempotencyScope = (typeof IDEMPOTENCY_SCOPE)[keyof typeof IDEMPOTENCY_SCOPE];
