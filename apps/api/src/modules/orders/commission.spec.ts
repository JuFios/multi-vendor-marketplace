import { calculateCommission, computeSellerOrderFinancials } from './commission';

describe('calculateCommission', () => {
  it.each([
    [0, 1000, 0],
    [1, 1000, 0],
    [4, 1000, 0],
    [5, 1000, 1],
    [14, 1000, 1],
    [15, 1000, 2],
    [10_000, 1000, 1_000],
    [123_456, 1000, 12_346],
    [999_999_999, 1000, 100_000_000],
    [5_000, 0, 0],
    [5_000, 10_000, 5_000],
    [3, 5000, 2],
  ])('takes %i cents at %i bps as %i', (amount, bps, expected) => {
    expect(calculateCommission(amount, bps)).toBe(expected);
  });

  it('refuses inputs that are not safe integers', () => {
    expect(() => calculateCommission(1.5, 1000)).toThrow(RangeError);
    expect(() => calculateCommission(Number.MAX_SAFE_INTEGER, 10_000)).toThrow(RangeError);
  });
});

describe('computeSellerOrderFinancials', () => {
  it('leaves the seller everything but the commission', () => {
    expect(computeSellerOrderFinancials(10_005, 0, 1000)).toEqual({
      commissionCents: 1_001,
      payoutCents: 9_004,
    });
  });

  it('works on what was not refunded', () => {
    expect(computeSellerOrderFinancials(10_000, 4_000, 1000)).toEqual({
      commissionCents: 600,
      payoutCents: 5_400,
    });
  });
});
