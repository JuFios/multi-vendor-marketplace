import { fitsStoredMoney, MAX_STORED_MONEY_CENTS } from '../../common/money';

import { computeSellerOrderFinancials } from './commission';
import { OrderTotalLimitError } from './orders.errors';

export interface SplittableItem {
  readonly sellerId: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
}

export interface SellerGroup<TItem extends SplittableItem> {
  readonly sellerId: string;
  readonly items: readonly TItem[];
  readonly subtotalCents: number;
  readonly commissionCents: number;
  readonly payoutCents: number;
}

/** One group per seller, in the order sellers first appear, with the group's money worked out. */
export function splitCartBySeller<TItem extends SplittableItem>(
  items: readonly TItem[],
  commissionBps: number,
): SellerGroup<TItem>[] {
  const bySeller = new Map<string, TItem[]>();
  for (const item of items) {
    const group = bySeller.get(item.sellerId);
    if (group) {
      group.push(item);
    } else {
      bySeller.set(item.sellerId, [item]);
    }
  }
  return [...bySeller].map(([sellerId, group]) => {
    const subtotalCents = group.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    return {
      sellerId,
      items: group,
      subtotalCents,
      ...computeSellerOrderFinancials(subtotalCents, 0, commissionBps),
    };
  });
}

/**
 * Refuses a cart the money columns could not hold. Every seller order is a part of the total, so
 * bounding the total bounds each of them as well.
 */
export function assertOrderTotalsStorable(groups: readonly { subtotalCents: number }[]): void {
  const totalCents = groups.reduce((sum, group) => sum + group.subtotalCents, 0);
  if (!fitsStoredMoney(totalCents)) {
    throw new OrderTotalLimitError(MAX_STORED_MONEY_CENTS);
  }
}
