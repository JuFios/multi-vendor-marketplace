export function sellerOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'so1',
    orderId: 'o1',
    createdAt: '2026-01-01T10:00:00Z',
    seller: { id: 's1', name: 'KeyShop' },
    status: 'NEW',
    paymentStatus: 'CAPTURED',
    subtotalCents: 2000,
    refundedCents: 0,
    commissionRateBps: 1000,
    commissionCents: 200,
    payoutCents: 1800,
    items: [
      {
        id: 'i1',
        productId: 'p1',
        title: 'Keyboard',
        unitPriceCents: 1000,
        quantity: 2,
        refundedQuantity: 0,
        lineTotalCents: 2000,
      },
    ],
    statusHistory: [
      { from: null, to: 'NEW', actor: 'CUSTOMER', reason: null, at: '2026-01-01T10:00:00Z' },
    ],
    ...overrides,
  };
}

export function order(
  sellerOrders: unknown[] = [sellerOrder()],
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'o1',
    status: 'NEW',
    hasCancelledParts: false,
    subtotalCents: 2000,
    refundedCents: 0,
    totalCents: 2000,
    commissionCents: 200,
    createdAt: '2026-01-01T10:00:00Z',
    sellerOrders,
    ...overrides,
  };
}
