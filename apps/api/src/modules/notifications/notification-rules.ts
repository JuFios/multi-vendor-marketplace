/** The event fields the rules look at; the payloads are narrowed by the caller. */
export type RuleEvent =
  | { type: 'seller_order.created'; payload: { sellerId: string } }
  | { type: 'seller_order.status_changed'; payload: { customerId: string; to: string } }
  | {
      type: 'seller_order.cancelled';
      payload: { customerId: string; sellerId: string; actorType: string };
    }
  | { type: 'seller.approved' | 'seller.rejected'; payload: { userId: string } };

export type Recipient =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'seller'; readonly sellerId: string };

/**
 * Who hears about an event. A cancellation is announced by `seller_order.cancelled` alone, so
 * the status change it also causes stays silent; the seller is told unless they cancelled it.
 */
export function recipientsOf(event: RuleEvent): Recipient[] {
  switch (event.type) {
    case 'seller_order.created':
      return [{ kind: 'seller', sellerId: event.payload.sellerId }];
    case 'seller_order.status_changed':
      return event.payload.to === 'CANCELLED'
        ? []
        : [{ kind: 'user', userId: event.payload.customerId }];
    case 'seller_order.cancelled':
      return [
        { kind: 'user', userId: event.payload.customerId },
        ...(event.payload.actorType === 'SELLER'
          ? []
          : [{ kind: 'seller', sellerId: event.payload.sellerId } as const]),
      ];
    case 'seller.approved':
    case 'seller.rejected':
      return [{ kind: 'user', userId: event.payload.userId }];
  }
}
