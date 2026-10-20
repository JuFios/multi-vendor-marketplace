import { cancellationDelta, refundDelta, saleDelta, type SaleInput } from './sales-delta';

const sale: SaleInput = {
  sellerId: 'seller',
  day: '2026-03-01',
  subtotalCents: 7_000,
  refundedCents: 2_000,
  commissionAtSaleCents: 700,
  commissionCents: 500,
  items: [
    { productId: 'b', quantity: 1, unitPriceCents: 3_000, refundedCents: 0 },
    { productId: 'a', quantity: 2, unitPriceCents: 2_000, refundedCents: 2_000 },
  ],
};

describe('saleDelta', () => {
  it('counts the order, its items, the subtotal and the commission at sale', () => {
    const delta = saleDelta(sale);

    expect(delta.seller).toEqual({
      ordersCount: 1,
      itemsCount: 3,
      grossCents: 7_000,
      refundedCents: 0,
      commissionCents: 700,
    });
    expect(delta.products).toEqual([
      { productId: 'a', quantity: 2, grossCents: 4_000, refundedCents: 0 },
      { productId: 'b', quantity: 1, grossCents: 3_000, refundedCents: 0 },
    ]);
  });
});

describe('cancellationDelta', () => {
  it('takes back the sale, the refunds and the commission still owed', () => {
    const delta = cancellationDelta(sale);

    expect(delta.seller).toEqual({
      ordersCount: -1,
      itemsCount: -3,
      grossCents: -7_000,
      refundedCents: -2_000,
      commissionCents: -500,
    });
    expect(delta.products).toContainEqual({
      productId: 'a',
      quantity: -2,
      grossCents: -4_000,
      refundedCents: -2_000,
    });
  });
});

describe('refundDelta', () => {
  const refund = {
    sellerId: 'seller',
    day: '2026-03-01',
    amountCents: 2_500,
    commissionGivenBackCents: 250,
    lines: [
      { productId: 'a', amountCents: 1_000 },
      { productId: 'a', amountCents: 500 },
      { productId: 'b', amountCents: 1_000 },
    ],
  };

  it('adds the refund and gives back commission without touching the counts', () => {
    const delta = refundDelta(refund);

    expect(delta.seller).toEqual({
      ordersCount: 0,
      itemsCount: 0,
      grossCents: 0,
      refundedCents: 2_500,
      commissionCents: -250,
    });
  });

  it('merges lines of the same product', () => {
    expect(refundDelta(refund).products).toEqual([
      { productId: 'a', quantity: 0, grossCents: 0, refundedCents: 1_500 },
      { productId: 'b', quantity: 0, grossCents: 0, refundedCents: 1_000 },
    ]);
  });

  it('nets to zero with the sale and the cancellation of the same order', () => {
    const total = [
      saleDelta(sale),
      refundDelta({
        ...refund,
        amountCents: 2_000,
        commissionGivenBackCents: 200,
        lines: [{ productId: 'a', amountCents: 2_000 }],
      }),
      cancellationDelta(sale),
    ];
    const sum = (pick: (d: (typeof total)[number]) => number): number =>
      total.reduce((acc, d) => acc + pick(d), 0);

    expect(sum((d) => d.seller.ordersCount)).toBe(0);
    expect(sum((d) => d.seller.grossCents)).toBe(0);
    expect(sum((d) => d.seller.refundedCents)).toBe(0);
    expect(sum((d) => d.seller.commissionCents)).toBe(0);
  });
});
