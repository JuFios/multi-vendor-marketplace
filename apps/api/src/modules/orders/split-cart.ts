import { computeSellerOrderFinancials } from './commission';

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
