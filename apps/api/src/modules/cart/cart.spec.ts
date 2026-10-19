import { availabilityOf, buildCart, type CartLineSource } from './cart';

const line = (overrides: Partial<CartLineSource> = {}): CartLineSource => ({
  productId: 'p1',
  sellerId: 's1',
  title: 'Item',
  type: 'FIXED_PRICE',
  priceCents: 1_000,
  stock: 5,
  isPublished: true,
  archivedAt: null,
  quantity: 2,
  ...overrides,
});

describe('availabilityOf', () => {
  it('is AVAILABLE up to the stock, inclusive', () => {
    expect(availabilityOf(line({ quantity: 5 }))).toBe('AVAILABLE');
  });

  it('is INSUFFICIENT_STOCK above the stock', () => {
    expect(availabilityOf(line({ quantity: 6 }))).toBe('INSUFFICIENT_STOCK');
    expect(availabilityOf(line({ stock: 0 }))).toBe('INSUFFICIENT_STOCK');
  });

  it('is UNAVAILABLE for an archived or unpublished product, whatever the stock', () => {
    expect(availabilityOf(line({ archivedAt: new Date() }))).toBe('UNAVAILABLE');
    expect(availabilityOf(line({ isPublished: false }))).toBe('UNAVAILABLE');
    expect(availabilityOf(line({ isPublished: false, stock: 0 }))).toBe('UNAVAILABLE');
  });
});

describe('buildCart', () => {
  it('is empty for no lines', () => {
    expect(buildCart([])).toEqual({ groups: [], totalCents: 0, itemsCount: 0, sellerCount: 0 });
  });

  it('groups lines by seller and sums line totals, subtotals and quantities', () => {
    const cart = buildCart([
      line({ productId: 'a', sellerId: 's1', priceCents: 1_000, quantity: 2 }),
      line({ productId: 'b', sellerId: 's2', priceCents: 250, quantity: 3 }),
      line({ productId: 'c', sellerId: 's1', priceCents: 500, quantity: 1 }),
    ]);

    expect(cart.groups.map((group) => [group.sellerId, group.subtotalCents])).toEqual([
      ['s1', 2_500],
      ['s2', 750],
    ]);
    expect(cart.groups[0]?.items.map((item) => item.lineTotalCents)).toEqual([2_000, 500]);
    expect(cart).toMatchObject({ totalCents: 3_250, itemsCount: 6, sellerCount: 2 });
  });
});
