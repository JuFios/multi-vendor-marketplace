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

/** Why a seller order is cancelled when nobody gave a reason. */
export const DEFAULT_CANCEL_REASONS = {
  CUSTOMER: 'Cancelled by the customer',
} as const;
