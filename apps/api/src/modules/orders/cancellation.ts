export interface CancellableMoney {
  readonly subtotalCents: number;
  readonly refundedCents: number;
  readonly commissionCents: number;
}

export interface CancellationPlan {
  /** What goes back to the buyer: the subtotal that was not refunded earlier. */
  readonly releasedCents: number;
  /** The commission to reverse; the cancelled seller order owes none. */
  readonly commissionReversalCents: number;
}

export function planCancellation(money: CancellableMoney): CancellationPlan {
  return {
    releasedCents: money.subtotalCents - money.refundedCents,
    commissionReversalCents: money.commissionCents,
  };
}

/** The order's totals after `releasedCents` of it was cancelled. */
export function orderTotalsAfterCancellation(
  order: { subtotalCents: number; refundedCents: number },
  releasedCents: number,
): { refundedCents: number; totalCents: number } {
  const refundedCents = order.refundedCents + releasedCents;
  return { refundedCents, totalCents: order.subtotalCents - refundedCents };
}

/** Why a seller order is cancelled when nobody gave a reason. */
export const DEFAULT_CANCEL_REASONS = {
  CUSTOMER: 'Cancelled by the customer',
} as const;
