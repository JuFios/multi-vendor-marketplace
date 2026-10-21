export function chartDays(startDay: number, grossPerDay: number, days = 30) {
  return Array.from({ length: days }, (_, index) => ({
    date: `2026-02-${String(startDay + index).padStart(2, '0')}`,
    grossCents: grossPerDay * (index + 1),
    commissionCents: Math.round((grossPerDay * (index + 1)) / 10),
    ordersCount: index % 3,
  }));
}

export const salesChart = {
  current: chartDays(1, 1000),
  previous: chartDays(1, 800),
  totals: {
    current: { grossCents: 465000, commissionCents: 46500, ordersCount: 29 },
    previous: { grossCents: 372000, commissionCents: 37200, ordersCount: 29 },
    deltaPct: { grossCents: 25, commissionCents: 25, ordersCount: 0 },
  },
};

export const summary = {
  from: '2026-02-01',
  to: '2026-03-02',
  platformRevenueCents: 46500,
  grossSalesCents: 465000,
  refundsCents: 5000,
  ordersCount: 29,
  revenueBySeller: [
    {
      sellerId: 's1',
      storeName: 'KeyShop',
      ordersCount: 20,
      itemsCount: 31,
      grossCents: 300000,
      refundedCents: 5000,
      revenueCents: 295000,
      commissionCents: 29500,
      netCents: 265500,
    },
  ],
  topProducts: [
    {
      productId: 'p1',
      title: 'Keyboard',
      sellerId: 's1',
      quantity: 14,
      grossCents: 168000,
      refundedCents: 0,
      revenueCents: 168000,
    },
  ],
  topSellers: [
    {
      sellerId: 's1',
      storeName: 'KeyShop',
      ordersCount: 20,
      itemsCount: 31,
      grossCents: 300000,
      refundedCents: 5000,
      revenueCents: 295000,
      commissionCents: 29500,
      netCents: 265500,
    },
  ],
  conversion: { cartsWithItems: 50, convertedCarts: 29, rate: 0.58 },
};
