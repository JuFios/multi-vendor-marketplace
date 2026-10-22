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

export interface CancelledItem {
  readonly productId: string;
  readonly auctionId: string | null;
  readonly quantity: number;
  readonly refundedQuantity: number;
}

export interface GoodsReturn {
  /** Fixed-price units that go back on sale, one entry per item with units left. */
  readonly restock: readonly { productId: string; quantity: number }[];
  /** Auction lots to offer again, in id order. */
  readonly lots: readonly string[];
}

/**
 * What a cancellation before shipping gives back. A refund of unshipped goods already put its
 * units back on sale, so they stay out of it here: otherwise they would be restocked twice. A
 * fully refunded lot is not offered again either.
 */
export function planGoodsReturn(items: readonly CancelledItem[]): GoodsReturn {
  const kept = items
    .map((item) => ({ ...item, remaining: item.quantity - item.refundedQuantity }))
    .filter((item) => item.remaining > 0);
  return {
    restock: kept
      .filter((item) => item.auctionId === null)
      .map((item) => ({ productId: item.productId, quantity: item.remaining })),
    lots: kept.flatMap((item) => (item.auctionId === null ? [] : [item.auctionId])).sort(),
  };
}

/** Why a seller order is cancelled when nobody gave a reason. */
export const DEFAULT_CANCEL_REASONS = {
  CUSTOMER: 'Cancelled by the customer',
} as const;
