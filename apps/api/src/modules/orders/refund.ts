import { computeSellerOrderFinancials } from './commission';
import type { SellerOrderStatusValue } from './order-status';
import {
  PaymentNotCapturedError,
  RefundExceedsRemainingError,
  RefundItemNotFoundError,
  RefundNotAllowedError,
} from './orders.errors';
import type { PaymentStatusValue } from './seller-order-state-machine';

const REFUNDABLE_STATUSES: readonly SellerOrderStatusValue[] = [
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
];

export interface RefundableItem {
  readonly id: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly refundedQuantity: number;
}

export interface RefundableSellerOrder {
  readonly status: SellerOrderStatusValue;
  readonly paymentStatus: PaymentStatusValue;
  readonly subtotalCents: number;
  readonly refundedCents: number;
  readonly commissionRateBps: number;
  readonly commissionCents: number;
  readonly items: readonly RefundableItem[];
}

export interface RefundRequestLine {
  readonly sellerOrderItemId: string;
  readonly quantity: number;
}

export interface RefundLine extends RefundRequestLine {
  readonly amountCents: number;
}

export interface RefundPlan {
  readonly lines: readonly RefundLine[];
  readonly amountCents: number;
  /** The seller order's refunded total once this refund is booked. */
  readonly refundedCents: number;
  readonly commissionCents: number;
  readonly commissionReversalCents: number;
  readonly payoutCents: number;
}

/** Only paid, accepted orders can be refunded. */
export function assertRefundable(
  sellerOrder: Pick<RefundableSellerOrder, 'status' | 'paymentStatus'>,
): void {
  if (!REFUNDABLE_STATUSES.includes(sellerOrder.status)) {
    throw new RefundNotAllowedError(sellerOrder.status);
  }
  if (sellerOrder.paymentStatus !== 'CAPTURED') {
    throw new PaymentNotCapturedError();
  }
}

/**
 * What refunding `requested` does to the seller order's money: each line is priced at the
 * unit price of the order, the commission is recomputed on what stays sold and the seller
 * gives back the difference.
 */
export function planRefund(
  sellerOrder: RefundableSellerOrder,
  requested: readonly RefundRequestLine[],
): RefundPlan {
  const lines = requested.map((line): RefundLine => {
    const item = sellerOrder.items.find((candidate) => candidate.id === line.sellerOrderItemId);
    if (item === undefined) {
      throw new RefundItemNotFoundError(line.sellerOrderItemId);
    }
    const remaining = item.quantity - item.refundedQuantity;
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > remaining) {
      throw new RefundExceedsRemainingError(item.id, remaining);
    }
    return { ...line, amountCents: item.unitPriceCents * line.quantity };
  });
  const amountCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const refundedCents = sellerOrder.refundedCents + amountCents;
  const financials = computeSellerOrderFinancials(
    sellerOrder.subtotalCents,
    refundedCents,
    sellerOrder.commissionRateBps,
  );
  return {
    lines,
    amountCents,
    refundedCents,
    commissionCents: financials.commissionCents,
    commissionReversalCents: sellerOrder.commissionCents - financials.commissionCents,
    payoutCents: financials.payoutCents,
  };
}

export interface RefundedItem {
  readonly id: string;
  readonly productId: string;
  readonly auctionId: string | null;
}

/**
 * The stock a refund gives back. Only a PROCESSING order still has its goods with the seller;
 * shipped goods are the buyer's, so refunding them is money only. An auction lot is not put on
 * sale again by a refund, as with a cancellation of a fully refunded lot.
 */
export function planRefundRestock(
  status: SellerOrderStatusValue,
  items: readonly RefundedItem[],
  lines: readonly RefundRequestLine[],
): { productId: string; quantity: number }[] {
  if (status !== 'PROCESSING') {
    return [];
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  return lines.flatMap((line) => {
    const item = byId.get(line.sellerOrderItemId);
    return item?.auctionId === null ? [{ productId: item.productId, quantity: line.quantity }] : [];
  });
}
