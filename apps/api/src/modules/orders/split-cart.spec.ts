import { AppError } from '../../common/exceptions/app-error';
import { MAX_STORED_MONEY_CENTS } from '../../common/money';

import { assertOrderTotalsStorable, splitCartBySeller } from './split-cart';

const item = (sellerId: string, unitPriceCents: number, quantity: number) => ({
  sellerId,
  unitPriceCents,
  quantity,
});

/** The error code a call fails with; undefined when it does not fail. */
const codeOf = (call: () => unknown): string | undefined => {
  try {
    call();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_AN_APP_ERROR';
  }
  return undefined;
};

describe('splitCartBySeller', () => {
  it('is empty for an empty cart', () => {
    expect(splitCartBySeller([], 1000)).toEqual([]);
  });

  it('makes one group per seller with its subtotal, commission and payout', () => {
    const groups = splitCartBySeller(
      [item('a', 1_005, 2), item('b', 250, 3), item('a', 500, 1)],
      1000,
    );

    expect(
      groups.map(({ sellerId, subtotalCents, commissionCents, payoutCents }) => ({
        sellerId,
        subtotalCents,
        commissionCents,
        payoutCents,
      })),
    ).toEqual([
      { sellerId: 'a', subtotalCents: 2_510, commissionCents: 251, payoutCents: 2_259 },
      { sellerId: 'b', subtotalCents: 750, commissionCents: 75, payoutCents: 675 },
    ]);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it('rounds the commission per seller, not on the whole cart', () => {
    const groups = splitCartBySeller([item('a', 5, 1), item('b', 5, 1)], 1000);

    expect(groups.map((group) => group.commissionCents)).toEqual([1, 1]);
  });
});

describe('assertOrderTotalsStorable', () => {
  it('accepts a cart whose total still fits the money columns', () => {
    expect(
      codeOf(() => assertOrderTotalsStorable([{ subtotalCents: MAX_STORED_MONEY_CENTS }])),
    ).toBeUndefined();
  });

  it('refuses a cart whose total the money columns could not hold', () => {
    expect(
      codeOf(() =>
        assertOrderTotalsStorable([
          { subtotalCents: 2_100_000_000 },
          { subtotalCents: 100_000_000 },
        ]),
      ),
    ).toBe('ORDER_TOTAL_LIMIT');
  });
});
