import { describe, expect, it } from 'vitest';

import type { Cart } from './cart-api';
import { withQuantity, withoutItem } from './cart-model';

const cart: Cart = {
  groups: [
    {
      seller: { id: 's1', name: 'One' },
      subtotalCents: 3000,
      items: [
        {
          productId: 'a',
          title: 'A',
          unitPriceCents: 1000,
          quantity: 1,
          stock: 5,
          availability: 'AVAILABLE',
          lineTotalCents: 1000,
        },
        {
          productId: 'b',
          title: 'B',
          unitPriceCents: 1000,
          quantity: 2,
          stock: 5,
          availability: 'AVAILABLE',
          lineTotalCents: 2000,
        },
      ],
    },
    {
      seller: { id: 's2', name: 'Two' },
      subtotalCents: 500,
      items: [
        {
          productId: 'c',
          title: 'C',
          unitPriceCents: 500,
          quantity: 1,
          stock: 1,
          availability: 'AVAILABLE',
          lineTotalCents: 500,
        },
      ],
    },
  ],
  totalCents: 3500,
  itemsCount: 4,
  sellerCount: 2,
};

describe('cart model', () => {
  it('recalculates line, group and cart totals for a new quantity', () => {
    const next = withQuantity(cart, 'a', 3);

    expect(next.groups[0]?.subtotalCents).toBe(5000);
    expect(next.totalCents).toBe(5500);
    expect(next.itemsCount).toBe(6);
  });

  it('drops a seller group when its last item is removed', () => {
    const next = withoutItem(cart, 'c');

    expect(next.sellerCount).toBe(1);
    expect(next.totalCents).toBe(3000);
  });
});
