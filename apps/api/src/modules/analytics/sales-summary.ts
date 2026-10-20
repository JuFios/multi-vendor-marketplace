export interface SellerTotals {
  readonly sellerId: string;
  readonly ordersCount: number;
  readonly itemsCount: number;
  readonly grossCents: number;
  readonly refundedCents: number;
  readonly commissionCents: number;
}

export interface ProductTotals {
  readonly productId: string;
  readonly sellerId: string;
  readonly quantity: number;
  readonly grossCents: number;
  readonly refundedCents: number;
}

export const TOP_LIMIT = 5;

/** What the store keeps of its sales before commission: gross minus refunds (I-15). */
export const revenueOf = (totals: { grossCents: number; refundedCents: number }): number =>
  totals.grossCents - totals.refundedCents;

/** Highest revenue first; ties by id so the order is stable. */
function byRevenue<T extends { grossCents: number; refundedCents: number }>(
  idOf: (row: T) => string,
): (a: T, b: T) => number {
  return (a, b) => revenueOf(b) - revenueOf(a) || idOf(a).localeCompare(idOf(b));
}

/** Rows that still stand for something: an order that was cancelled leaves an all-zero row. */
export const hasSales = (totals: SellerTotals): boolean =>
  totals.ordersCount !== 0 || totals.grossCents !== 0 || totals.refundedCents !== 0;

export function rankSellers(rows: readonly SellerTotals[], limit = TOP_LIMIT): SellerTotals[] {
  return rows
    .filter(hasSales)
    .sort(byRevenue((row) => row.sellerId))
    .slice(0, limit);
}

export function rankProducts(rows: readonly ProductTotals[], limit = TOP_LIMIT): ProductTotals[] {
  return rows
    .filter((row) => row.quantity !== 0 || row.grossCents !== 0)
    .sort(byRevenue((row) => row.productId))
    .slice(0, limit);
}

/** Share of carts that became orders, from 0 to 1, four decimals; 0 when no cart had items. */
export function conversionRate(cartsWithItems: number, convertedCarts: number): number {
  return cartsWithItems === 0 ? 0 : Math.round((convertedCarts / cartsWithItems) * 10_000) / 10_000;
}
