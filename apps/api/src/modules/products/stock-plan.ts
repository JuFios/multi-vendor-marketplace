export interface StockRequest {
  readonly productId: string;
  readonly quantity: number;
}

export interface StockShortage {
  readonly productId: string;
  readonly requested: number;
  readonly available: number;
}

export interface StockPlan {
  /** One entry per product, ordered by id: the order in which rows must be locked. */
  readonly deductions: readonly StockRequest[];
  /** Products whose snapshot stock is below the request; empty when no snapshot was given. */
  readonly shortages: readonly StockShortage[];
}

/**
 * Merges duplicate products and sorts them by id, so every transaction locks the same rows in
 * the same order and two checkouts cannot deadlock. With a stock snapshot it also reports the
 * products that cannot be covered; the snapshot is advisory, the conditional UPDATE decides.
 */
export function planStockDeduction(
  requests: readonly StockRequest[],
  stocks?: ReadonlyMap<string, number>,
): StockPlan {
  const merged = new Map<string, number>();
  for (const { productId, quantity } of requests) {
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }
  const deductions = [...merged]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  const shortages = stocks
    ? deductions.flatMap(({ productId, quantity }) => {
        const available = stocks.get(productId) ?? 0;
        return available < quantity ? [{ productId, requested: quantity, available }] : [];
      })
    : [];
  return { deductions, shortages };
}
