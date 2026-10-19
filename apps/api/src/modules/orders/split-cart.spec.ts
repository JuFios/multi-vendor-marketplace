import { splitCartBySeller } from './split-cart';

const item = (sellerId: string, unitPriceCents: number, quantity: number) => ({
  sellerId,
  unitPriceCents,
  quantity,
});

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
