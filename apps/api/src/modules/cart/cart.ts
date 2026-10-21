export const CART_MIN_QUANTITY = 1;
export const CART_MAX_QUANTITY = 99;

export const CART_AVAILABILITIES = ['AVAILABLE', 'INSUFFICIENT_STOCK', 'UNAVAILABLE'] as const;
export type CartAvailability = (typeof CART_AVAILABILITIES)[number];

/** A cart row joined with the product's current state. */
export interface CartLineSource {
  readonly productId: string;
  readonly sellerId: string;
  readonly title: string;
  readonly type: 'FIXED_PRICE' | 'AUCTION';
  readonly priceCents: number | null;
  readonly stock: number;
  readonly isPublished: boolean;
  readonly archivedAt: Date | null;
  readonly quantity: number;
  /** Set on auction lots the user has won and can still check out; absent otherwise. */
  readonly auctionWon?: boolean;
}

/** A cart row with its product's state and whether it can be bought right now. */
export interface CheckoutLine extends CartLineSource {
  readonly availability: CartAvailability;
}

export interface CartLine {
  readonly productId: string;
  readonly title: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly stock: number;
  readonly availability: CartAvailability;
  readonly lineTotalCents: number;
}

export interface CartGroup {
  readonly sellerId: string;
  readonly items: readonly CartLine[];
  readonly subtotalCents: number;
}

export interface CartView {
  readonly groups: readonly CartGroup[];
  readonly totalCents: number;
  readonly itemsCount: number;
  readonly sellerCount: number;
}

/**
 * A product that is gone from the catalog cannot be bought; too little stock can be fixed. An
 * auction lot can be bought only by its winner, within the checkout window.
 */
export function availabilityOf(line: CartLineSource): CartAvailability {
  if (!line.isPublished || line.archivedAt !== null) {
    return 'UNAVAILABLE';
  }
  if (line.type === 'AUCTION') {
    return line.auctionWon === true ? 'AVAILABLE' : 'UNAVAILABLE';
  }
  return line.quantity > line.stock ? 'INSUFFICIENT_STOCK' : 'AVAILABLE';
}

/** What a line costs: the current unit price times the quantity. */
export function lineTotalCents(priceCents: number | null, quantity: number): number {
  return (priceCents ?? 0) * quantity;
}

/**
 * Groups lines by seller, in the order sellers first appear. Prices are the current ones, so
 * the totals always match what the lines show; `itemsCount` is the sum of quantities.
 */
export function buildCart(lines: readonly CartLineSource[]): CartView {
  const bySeller = new Map<string, CartLine[]>();
  for (const line of lines) {
    const unitPriceCents = line.priceCents ?? 0;
    const entry: CartLine = {
      productId: line.productId,
      title: line.title,
      unitPriceCents,
      quantity: line.quantity,
      stock: line.stock,
      availability: availabilityOf(line),
      lineTotalCents: lineTotalCents(line.priceCents, line.quantity),
    };
    const group = bySeller.get(line.sellerId);
    if (group) {
      group.push(entry);
    } else {
      bySeller.set(line.sellerId, [entry]);
    }
  }
  const groups = [...bySeller].map(([sellerId, items]) => ({
    sellerId,
    items,
    subtotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
  }));
  return {
    groups,
    totalCents: groups.reduce((sum, group) => sum + group.subtotalCents, 0),
    itemsCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    sellerCount: groups.length,
  };
}
