import { toRefundFacts, toSaleFacts, type RefundSource, type SaleSource } from './sales-facts';

const sale: SaleSource = {
  sellerOrderId: 'so',
  sellerId: 'seller',
  day: '2026-03-01',
  subtotalCents: 10_050,
  refundedCents: 0,
  commissionRateBps: 1_000,
  items: [{ productId: 'p', quantity: 1, unitPriceCents: 10_050, refundedCents: 0 }],
};

describe('toSaleFacts', () => {
  it('prices the commission at sale on the whole subtotal, rounding half up', () => {
    expect(toSaleFacts(sale).commissionAtSaleCents).toBe(1_005);
    expect(toSaleFacts({ ...sale, subtotalCents: 105 }).commissionAtSaleCents).toBe(11);
  });

  it('prices the current commission on what is left after refunds', () => {
    const facts = toSaleFacts({ ...sale, refundedCents: 5_025 });

    expect(facts.commissionAtSaleCents).toBe(1_005);
    expect(facts.commissionCents).toBe(503);
  });
});

describe('toRefundFacts', () => {
  const refund: RefundSource = {
    sellerOrderId: 'so',
    sellerId: 'seller',
    day: '2026-03-01',
    subtotalCents: 10_000,
    commissionRateBps: 1_000,
    refundedBeforeCents: 0,
    lines: [
      { productId: 'a', amountCents: 2_000 },
      { productId: 'b', amountCents: 1_000 },
    ],
  };

  it('sums the batch and gives back the commission on it', () => {
    expect(toRefundFacts(refund)).toMatchObject({
      amountCents: 3_000,
      commissionGivenBackCents: 300,
    });
  });

  it('measures the commission against what was refunded before', () => {
    const second = toRefundFacts({ ...refund, refundedBeforeCents: 3_000 });

    expect(second.commissionGivenBackCents).toBe(300);
  });

  it('makes the commission given back across batches add up to the order total', () => {
    const batches = [1_005, 1_005, 1_005];
    let before = 0;
    let givenBack = 0;
    for (const amount of batches) {
      givenBack += toRefundFacts({
        ...refund,
        subtotalCents: 3_015,
        refundedBeforeCents: before,
        lines: [{ productId: 'a', amountCents: amount }],
      }).commissionGivenBackCents;
      before += amount;
    }

    expect(givenBack).toBe(302);
  });
});
