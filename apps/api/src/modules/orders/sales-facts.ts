import { calculateCommission } from './commission';

/** What a seller order was when it was placed, as stored; never changes afterwards except `refundedCents`. */
export interface SaleSource {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  /** Calendar day of the order's creation in the requested time zone, `YYYY-MM-DD`. */
  readonly day: string;
  readonly subtotalCents: number;
  readonly refundedCents: number;
  readonly commissionRateBps: number;
  readonly items: readonly {
    readonly productId: string;
    readonly quantity: number;
    readonly unitPriceCents: number;
    readonly refundedCents: number;
  }[];
}

export interface SaleFacts {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  readonly day: string;
  readonly subtotalCents: number;
  /** Everything refunded on the order; final once the order is cancelled. */
  readonly refundedCents: number;
  /** Commission on the whole subtotal: what the order owed when it was placed. */
  readonly commissionAtSaleCents: number;
  /** Commission on what stays after all refunds: what the order owes now. */
  readonly commissionCents: number;
  readonly items: SaleSource['items'];
}

export function toSaleFacts(source: SaleSource): SaleFacts {
  return {
    sellerOrderId: source.sellerOrderId,
    sellerId: source.sellerId,
    day: source.day,
    subtotalCents: source.subtotalCents,
    refundedCents: source.refundedCents,
    commissionAtSaleCents: calculateCommission(source.subtotalCents, source.commissionRateBps),
    commissionCents: calculateCommission(
      source.subtotalCents - source.refundedCents,
      source.commissionRateBps,
    ),
    items: source.items,
  };
}

/** One batch of refunds recorded together, and what was refunded on the order before it. */
export interface RefundSource {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  readonly day: string;
  readonly subtotalCents: number;
  readonly commissionRateBps: number;
  readonly refundedBeforeCents: number;
  readonly lines: readonly { readonly productId: string; readonly amountCents: number }[];
}

export interface RefundFacts {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  readonly day: string;
  readonly lines: RefundSource['lines'];
  readonly amountCents: number;
  /** How much less commission the order owes once this batch is refunded. */
  readonly commissionGivenBackCents: number;
}

export function toRefundFacts(source: RefundSource): RefundFacts {
  const amountCents = source.lines.reduce((sum, line) => sum + line.amountCents, 0);
  const owedBefore = calculateCommission(
    source.subtotalCents - source.refundedBeforeCents,
    source.commissionRateBps,
  );
  const owedAfter = calculateCommission(
    source.subtotalCents - source.refundedBeforeCents - amountCents,
    source.commissionRateBps,
  );
  return {
    sellerOrderId: source.sellerOrderId,
    sellerId: source.sellerId,
    day: source.day,
    lines: source.lines,
    amountCents,
    commissionGivenBackCents: owedBefore - owedAfter,
  };
}
