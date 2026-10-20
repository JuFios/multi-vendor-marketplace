/** Signed change to one day of one store's totals. */
export interface SellerDelta {
  readonly ordersCount: number;
  readonly itemsCount: number;
  readonly grossCents: number;
  readonly refundedCents: number;
  readonly commissionCents: number;
}

/** Signed change to one day of one product's totals. */
export interface ProductDelta {
  readonly productId: string;
  readonly quantity: number;
  readonly grossCents: number;
  readonly refundedCents: number;
}

export interface SalesDelta {
  readonly day: string;
  readonly sellerId: string;
  readonly seller: SellerDelta;
  readonly products: readonly ProductDelta[];
}

export interface SaleInput {
  readonly sellerId: string;
  readonly day: string;
  readonly subtotalCents: number;
  readonly refundedCents: number;
  readonly commissionAtSaleCents: number;
  readonly commissionCents: number;
  readonly items: readonly {
    readonly productId: string;
    readonly quantity: number;
    readonly unitPriceCents: number;
    readonly refundedCents: number;
  }[];
}

export interface RefundInput {
  readonly sellerId: string;
  readonly day: string;
  readonly amountCents: number;
  readonly commissionGivenBackCents: number;
  readonly lines: readonly { readonly productId: string; readonly amountCents: number }[];
}

const sumOf = <T>(rows: readonly T[], pick: (row: T) => number): number =>
  rows.reduce((sum, row) => sum + pick(row), 0);

function mergeByProduct(rows: readonly ProductDelta[]): ProductDelta[] {
  const merged = new Map<string, ProductDelta>();
  for (const row of rows) {
    const known = merged.get(row.productId);
    merged.set(
      row.productId,
      known === undefined
        ? row
        : {
            productId: row.productId,
            quantity: known.quantity + row.quantity,
            grossCents: known.grossCents + row.grossCents,
            refundedCents: known.refundedCents + row.refundedCents,
          },
    );
  }
  return [...merged.values()].sort((a, b) => a.productId.localeCompare(b.productId));
}

/** A placed order adds its whole subtotal and the commission it owes on it. */
export function saleDelta(sale: SaleInput): SalesDelta {
  return {
    day: sale.day,
    sellerId: sale.sellerId,
    seller: {
      ordersCount: 1,
      itemsCount: sumOf(sale.items, (item) => item.quantity),
      grossCents: sale.subtotalCents,
      refundedCents: 0,
      commissionCents: sale.commissionAtSaleCents,
    },
    products: mergeByProduct(
      sale.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        grossCents: item.quantity * item.unitPriceCents,
        refundedCents: 0,
      })),
    ),
  };
}

/**
 * A cancelled order takes back everything that is still counted for it: the sale, the refunds
 * counted so far (they belong to the order, which no longer counts) and the commission it
 * owes after them. Refunds happen before a cancellation, so the order's final figures are
 * exactly what the sale and the refund events added.
 */
export function cancellationDelta(sale: SaleInput): SalesDelta {
  return {
    day: sale.day,
    sellerId: sale.sellerId,
    seller: {
      ordersCount: -1,
      itemsCount: -sumOf(sale.items, (item) => item.quantity),
      grossCents: -sale.subtotalCents,
      refundedCents: -sale.refundedCents,
      commissionCents: -sale.commissionCents,
    },
    products: mergeByProduct(
      sale.items.map((item) => ({
        productId: item.productId,
        quantity: -item.quantity,
        grossCents: -(item.quantity * item.unitPriceCents),
        refundedCents: -item.refundedCents,
      })),
    ),
  };
}

/** A refund counts against the day of the order, and gives back part of the commission. */
export function refundDelta(refund: RefundInput): SalesDelta {
  return {
    day: refund.day,
    sellerId: refund.sellerId,
    seller: {
      ordersCount: 0,
      itemsCount: 0,
      grossCents: 0,
      refundedCents: refund.amountCents,
      commissionCents: -refund.commissionGivenBackCents,
    },
    products: mergeByProduct(
      refund.lines.map((line) => ({
        productId: line.productId,
        quantity: 0,
        grossCents: 0,
        refundedCents: line.amountCents,
      })),
    ),
  };
}
