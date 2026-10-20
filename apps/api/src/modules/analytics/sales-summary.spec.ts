import { conversionRate, rankProducts, rankSellers, type SellerTotals } from './sales-summary';

const seller = (sellerId: string, grossCents: number, refundedCents = 0): SellerTotals => ({
  sellerId,
  ordersCount: 1,
  itemsCount: 1,
  grossCents,
  refundedCents,
  commissionCents: 0,
});

describe('rankSellers', () => {
  it('ranks by revenue after refunds and keeps five', () => {
    const rows = [
      seller('a', 1_000),
      seller('b', 5_000, 4_500),
      seller('c', 3_000),
      seller('d', 2_000),
      seller('e', 4_000),
      seller('f', 900),
      seller('g', 100),
    ];

    expect(rankSellers(rows).map((row) => row.sellerId)).toEqual(['e', 'c', 'd', 'a', 'f']);
  });

  it('breaks ties by id and leaves out stores whose orders were all cancelled', () => {
    const cancelled = { ...seller('z', 0), ordersCount: 0 };

    expect(
      rankSellers([seller('b', 100), seller('a', 100), cancelled]).map((r) => r.sellerId),
    ).toEqual(['a', 'b']);
  });
});

describe('rankProducts', () => {
  it('ranks by revenue after refunds', () => {
    const rows = ['x', 'y'].map((productId, index) => ({
      productId,
      sellerId: 's',
      quantity: 1,
      grossCents: 1_000,
      refundedCents: index * 600,
    }));

    expect(rankProducts(rows).map((row) => row.productId)).toEqual(['x', 'y']);
  });
});

describe('conversionRate', () => {
  it('is converted over started carts, four decimals', () => {
    expect(conversionRate(3, 1)).toBe(0.3333);
    expect(conversionRate(4, 4)).toBe(1);
  });

  it('is zero when no cart got an item', () => {
    expect(conversionRate(0, 0)).toBe(0);
  });
});
