import { orderTotalsAfterCancellation, planCancellation } from './cancellation';

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

describe('orderTotalsAfterCancellation', () => {
  it('moves the released amount from the total to the refunded sum', () => {
    expect(
      orderTotalsAfterCancellation({ subtotalCents: 30_000, refundedCents: 0 }, 10_000),
    ).toEqual({
      refundedCents: 10_000,
      totalCents: 20_000,
    });
  });

  it('reaches a total of zero once everything is cancelled', () => {
    const afterFirst = orderTotalsAfterCancellation(
      { subtotalCents: 30_000, refundedCents: 0 },
      10_000,
    );

    expect(
      orderTotalsAfterCancellation({ subtotalCents: 30_000, ...afterFirst }, 20_000).totalCents,
    ).toBe(0);
  });
});
