import type { Cart, CartGroup } from './cart-api';

function recalculate(groups: CartGroup[]): Cart {
  const nonEmpty = groups.filter((group) => group.items.length > 0);
  return {
    groups: nonEmpty,
    totalCents: nonEmpty.reduce((sum, group) => sum + group.subtotalCents, 0),
    itemsCount: nonEmpty.reduce(
      (sum, group) => sum + group.items.reduce((inner, item) => inner + item.quantity, 0),
      0,
    ),
    sellerCount: nonEmpty.length,
  };
}

/** What the cart would look like after the change, used until the server confirms it. */
export function withQuantity(cart: Cart, productId: string, quantity: number): Cart {
  return recalculate(
    cart.groups.map((group) => {
      const items = group.items.map((item) =>
        item.productId === productId
          ? { ...item, quantity, lineTotalCents: item.unitPriceCents * quantity }
          : item,
      );
      return {
        ...group,
        items,
        subtotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
      };
    }),
  );
}

export function withoutItem(cart: Cart, productId: string): Cart {
  return recalculate(
    cart.groups.map((group) => {
      const items = group.items.filter((item) => item.productId !== productId);
      return {
        ...group,
        items,
        subtotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
      };
    }),
  );
}
