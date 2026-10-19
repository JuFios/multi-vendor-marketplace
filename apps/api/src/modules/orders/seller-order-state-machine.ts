import { ForbiddenError } from '../../common/exceptions';

import type { SellerOrderStatusValue } from './order-status';
import { InvalidStatusTransitionError, PaymentNotCapturedError } from './orders.errors';

export type Actor = 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'SYSTEM';
export type PaymentStatusValue = 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED';

export interface TransitionContext {
  readonly paymentStatus: PaymentStatusValue;
  /** Cancelling a shipped or completed seller order is only possible when a dispute decides it. */
  readonly viaDispute?: boolean;
}

interface Rule {
  readonly from: SellerOrderStatusValue;
  readonly to: SellerOrderStatusValue;
  readonly actors: readonly Actor[];
  readonly needsCapturedPayment?: boolean;
  readonly needsDispute?: boolean;
}

const RULES: readonly Rule[] = [
  { from: 'NEW', to: 'PROCESSING', actors: ['SELLER'], needsCapturedPayment: true },
  { from: 'PROCESSING', to: 'SHIPPED', actors: ['SELLER'] },
  { from: 'SHIPPED', to: 'COMPLETED', actors: ['CUSTOMER', 'ADMIN'] },
  { from: 'NEW', to: 'CANCELLED', actors: ['CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM'] },
  { from: 'PROCESSING', to: 'CANCELLED', actors: ['SELLER', 'ADMIN'] },
  { from: 'SHIPPED', to: 'CANCELLED', actors: ['ADMIN'], needsDispute: true },
  { from: 'COMPLETED', to: 'CANCELLED', actors: ['ADMIN'], needsDispute: true },
];

/**
 * Throws unless `actor` may move a seller order from `from` to `to`. Whether the actor owns
 * the order is the caller's business; this only knows who may do what.
 */
export function assertTransition(
  from: SellerOrderStatusValue,
  to: SellerOrderStatusValue,
  actor: Actor,
  context: TransitionContext,
): void {
  const rule = RULES.find((candidate) => candidate.from === from && candidate.to === to);
  if (!rule || (rule.needsDispute === true && context.viaDispute !== true)) {
    throw new InvalidStatusTransitionError(from, to);
  }
  if (!rule.actors.includes(actor)) {
    throw new ForbiddenError('You may not make this status change', 'TRANSITION_NOT_ALLOWED');
  }
  if (rule.needsCapturedPayment === true && context.paymentStatus !== 'CAPTURED') {
    throw new PaymentNotCapturedError();
  }
}
