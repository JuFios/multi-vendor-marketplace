import { planCancellation, planGoodsReturn } from './cancellation';

describe('planCancellation', () => {
  it('releases the whole subtotal and reverses the whole commission', () => {
    expect(
      planCancellation({ subtotalCents: 10_005, refundedCents: 0, commissionCents: 1_001 }),
    ).toEqual({
      releasedCents: 10_005,
      commissionReversalCents: 1_001,
    });
  });

  it('releases only what was not refunded before', () => {
    expect(
      planCancellation({ subtotalCents: 10_000, refundedCents: 4_000, commissionCents: 600 }),
    ).toEqual({
      releasedCents: 6_000,
      commissionReversalCents: 600,
    });
  });

  it('nets the seller order to zero with the original sale and commission entries', () => {
    const money = { subtotalCents: 10_005, refundedCents: 0, commissionCents: 1_001 };
    const plan = planCancellation(money);

    const sum =
      money.subtotalCents -
      money.commissionCents -
      plan.releasedCents +
      plan.commissionReversalCents;

    expect(sum).toBe(0);
  });
});

describe('planGoodsReturn', () => {
  const item = (overrides: Partial<Parameters<typeof planGoodsReturn>[0][number]>) => ({
    productId: 'p1',
    auctionId: null,
    quantity: 3,
    refundedQuantity: 0,
    ...overrides,
  });

  it('gives back every unit of an order without refunds', () => {
    expect(planGoodsReturn([item({})])).toEqual({
      restock: [{ productId: 'p1', quantity: 3 }],
      lots: [],
    });
  });

  it('leaves out the units refunded earlier, so the order of the two does not matter', () => {
    expect(planGoodsReturn([item({ refundedQuantity: 1 })]).restock).toEqual([
      { productId: 'p1', quantity: 2 },
    ]);
    expect(planGoodsReturn([item({ refundedQuantity: 3 })]).restock).toEqual([]);
  });

  it('offers the lots again in id order, except a refunded one', () => {
    expect(
      planGoodsReturn([
        item({ productId: 'p3', auctionId: 'a3', quantity: 1 }),
        item({ productId: 'p2', auctionId: 'a2', quantity: 1, refundedQuantity: 1 }),
        item({ productId: 'p1', auctionId: 'a1', quantity: 1 }),
      ]),
    ).toEqual({ restock: [], lots: ['a1', 'a3'] });
  });
});
