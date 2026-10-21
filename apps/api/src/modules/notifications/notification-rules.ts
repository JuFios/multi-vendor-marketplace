/** The event fields the rules look at; the payloads are narrowed by the caller. */
export type RuleEvent =
  | { type: 'seller_order.created'; payload: { sellerId: string } }
  | { type: 'seller_order.status_changed'; payload: { customerId: string; to: string } }
  | {
      type: 'seller_order.cancelled';
      payload: { customerId: string; sellerId: string; actorType: string };
    }
  | { type: 'refund.created'; payload: { customerId: string } }
  | {
      type: 'auction.closed';
      payload: { sellerId: string; outcome: string; winnerId?: string; closedBy?: string };
    }
  | { type: 'auction.winner_expired'; payload: { sellerId: string; previousWinnerId: string } }
  | {
      type: 'dispute.opened' | 'dispute.resolved';
      payload: { customerId: string; sellerId: string };
    }
  | {
      type: 'dispute.message_added';
      payload: { customerId: string; sellerId: string; authorRole: string };
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
    case 'auction.closed':
      // A seller who archived the lot closed it themselves and needs no word about it.
      return [
        ...(event.payload.outcome === 'SOLD_TO_WINNER' && event.payload.winnerId !== undefined
          ? [{ kind: 'user', userId: event.payload.winnerId } as const]
          : []),
        ...(event.payload.closedBy === 'ARCHIVE'
          ? []
          : [{ kind: 'seller', sellerId: event.payload.sellerId } as const]),
      ];
    case 'auction.winner_expired':
      return [
        { kind: 'user', userId: event.payload.previousWinnerId },
        { kind: 'seller', sellerId: event.payload.sellerId },
      ];
    case 'refund.created':
      return [{ kind: 'user', userId: event.payload.customerId }];
    case 'dispute.opened':
      return [{ kind: 'seller', sellerId: event.payload.sellerId }];
    case 'dispute.message_added':
      return [
        ...(event.payload.authorRole === 'CUSTOMER'
          ? []
          : [{ kind: 'user', userId: event.payload.customerId } as const]),
        ...(event.payload.authorRole === 'SELLER'
          ? []
          : [{ kind: 'seller', sellerId: event.payload.sellerId } as const]),
      ];
    case 'dispute.resolved':
      return [
        { kind: 'user', userId: event.payload.customerId },
        { kind: 'seller', sellerId: event.payload.sellerId },
      ];
    case 'seller.approved':
    case 'seller.rejected':
      return [{ kind: 'user', userId: event.payload.userId }];
  }
}
