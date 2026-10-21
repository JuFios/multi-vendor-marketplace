import type { SellerOrder } from '../orders/orders-api';
import { remainingQuantity } from '../seller/refund';

import type { ResolveBody } from './admin-api';

export interface ResolutionValues {
  outcome: 'RESOLVED_BUYER_FAVOR' | 'RESOLVED_SELLER_FAVOR';
  /** Units to refund per `sellerOrderItemId`. */
  quantities: Readonly<Record<string, number>>;
  finalStatus: '' | 'CANCELLED' | 'COMPLETED';
  note: string;
}

export const NOTE_MAX_LENGTH = 500;

/** Why the resolution cannot be sent yet, or null when it can. */
export function validateResolution(
  values: ResolutionValues,
  order: Pick<SellerOrder, 'items'>,
): string | null {
  if (values.note.trim() === '') {
    return 'Write a note for both parties.';
  }
  if (values.note.length > NOTE_MAX_LENGTH) {
    return `The note can have at most ${NOTE_MAX_LENGTH} characters.`;
  }
  if (values.outcome === 'RESOLVED_BUYER_FAVOR') {
    for (const item of order.items) {
      if ((values.quantities[item.id] ?? 0) > remainingQuantity(item)) {
        return `Cannot refund more than ${remainingQuantity(item)} of ${item.title}.`;
      }
    }
  }
  return null;
}

/** Refund items and the final status only make sense when the buyer wins. */
export function toResolveBody(values: ResolutionValues): ResolveBody {
  if (values.outcome === 'RESOLVED_SELLER_FAVOR') {
    return { outcome: 'RESOLVED_SELLER_FAVOR', note: values.note.trim() };
  }
  const refundItems = Object.entries(values.quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([sellerOrderItemId, quantity]) => ({ sellerOrderItemId, quantity }));
  return {
    outcome: 'RESOLVED_BUYER_FAVOR',
    note: values.note.trim(),
    ...(refundItems.length > 0 && { refundItems }),
    ...(values.finalStatus !== '' && { sellerOrderFinalStatus: values.finalStatus }),
  };
}
