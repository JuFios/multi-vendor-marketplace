import { previewRefund } from '../../lib/money';
import type { SellerOrder } from '../orders/orders-api';

type Item = SellerOrder['items'][number];

export function remainingQuantity(item: Item): number {
  return item.quantity - item.refundedQuantity;
}

export interface RefundSelection {
  /** Units to give back per `sellerOrderItemId`; zero or absent means untouched. */
  quantities: Readonly<Record<string, number>>;
}

export function refundableStatus(order: Pick<SellerOrder, 'status' | 'paymentStatus'>): boolean {
  return (
    ['PROCESSING', 'SHIPPED', 'COMPLETED'].includes(order.status) &&
    order.paymentStatus === 'CAPTURED'
  );
}

/** What the refund would cost and how the commission and payout change, before the server confirms. */
export function describeRefund(order: SellerOrder, selection: RefundSelection) {
  const lines = order.items.flatMap((item) => {
    const quantity = selection.quantities[item.id] ?? 0;
    return quantity > 0 ? [{ item, quantity }] : [];
  });
  const exceeds = lines.some((line) => line.quantity > remainingQuantity(line.item));
  const amountCents = lines.reduce(
    (sum, line) => sum + line.item.unitPriceCents * line.quantity,
    0,
  );
  const after = previewRefund({
    subtotalCents: order.subtotalCents,
    alreadyRefundedCents: order.refundedCents,
    rateBps: order.commissionRateBps,
    additionalRefundCents: amountCents,
  });
  return {
    lines,
    exceeds,
    valid: lines.length > 0 && !exceeds,
    amountCents,
    commissionAfterCents: after.commissionCents,
    payoutAfterCents: after.payoutCents,
    commissionReturnedCents: order.commissionCents - after.commissionCents,
  };
}
