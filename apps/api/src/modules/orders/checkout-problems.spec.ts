import { type CheckoutLineState, findCheckoutProblems } from './checkout-problems';

const line = (overrides: Partial<CheckoutLineState> = {}): CheckoutLineState => ({
  productId: 'p',
  type: 'FIXED_PRICE',
  availability: 'AVAILABLE',
  ...overrides,
});

describe('findCheckoutProblems', () => {
  it('finds nothing in a cart that can be bought', () => {
    expect(findCheckoutProblems([line(), line({ productId: 'q' })])).toEqual([]);
  });

  it('lists every problem line with its reason', () => {
    expect(
      findCheckoutProblems([
        line({ productId: 'a', availability: 'UNAVAILABLE' }),
        line({ productId: 'b' }),
        line({ productId: 'c', availability: 'INSUFFICIENT_STOCK' }),
        line({ productId: 'd', type: 'AUCTION' }),
      ]),
    ).toEqual([
      { productId: 'a', reason: 'UNAVAILABLE' },
      { productId: 'c', reason: 'INSUFFICIENT_STOCK' },
      { productId: 'd', reason: 'AUCTION_NOT_SUPPORTED' },
    ]);
  });
});
