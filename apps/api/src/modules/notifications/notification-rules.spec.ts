import { recipientsOf } from './notification-rules';

describe('recipientsOf', () => {
  it('tells the seller about a new order', () => {
    expect(recipientsOf({ type: 'seller_order.created', payload: { sellerId: 's1' } })).toEqual([
      { kind: 'seller', sellerId: 's1' },
    ]);
  });

  it('tells the customer about a status change', () => {
    expect(
      recipientsOf({
        type: 'seller_order.status_changed',
        payload: { customerId: 'c1', to: 'SHIPPED' },
      }),
    ).toEqual([{ kind: 'user', userId: 'c1' }]);
  });

  it('keeps quiet about the status change a cancellation causes', () => {
    expect(
      recipientsOf({
        type: 'seller_order.status_changed',
        payload: { customerId: 'c1', to: 'CANCELLED' },
      }),
    ).toEqual([]);
  });

  it.each(['CUSTOMER', 'ADMIN', 'SYSTEM'])(
    'tells the customer and the seller about a cancellation by %s',
    (actorType) => {
      expect(
        recipientsOf({
          type: 'seller_order.cancelled',
          payload: { customerId: 'c1', sellerId: 's1', actorType },
        }),
      ).toEqual([
        { kind: 'user', userId: 'c1' },
        { kind: 'seller', sellerId: 's1' },
      ]);
    },
  );

  it('does not tell the seller about a cancellation they made', () => {
    expect(
      recipientsOf({
        type: 'seller_order.cancelled',
        payload: { customerId: 'c1', sellerId: 's1', actorType: 'SELLER' },
      }),
    ).toEqual([{ kind: 'user', userId: 'c1' }]);
  });

  it('tells the customer about a refund', () => {
    expect(recipientsOf({ type: 'refund.created', payload: { customerId: 'c1' } })).toEqual([
      { kind: 'user', userId: 'c1' },
    ]);
  });

  it('tells the winner and the seller that an auction was won', () => {
    expect(
      recipientsOf({
        type: 'auction.closed',
        payload: { sellerId: 's1', outcome: 'SOLD_TO_WINNER', winnerId: 'w1' },
      }),
    ).toEqual([
      { kind: 'user', userId: 'w1' },
      { kind: 'seller', sellerId: 's1' },
    ]);
  });

  it('tells only the seller that an auction ended without bids', () => {
    expect(
      recipientsOf({ type: 'auction.closed', payload: { sellerId: 's1', outcome: 'NOT_SOLD' } }),
    ).toEqual([{ kind: 'seller', sellerId: 's1' }]);
  });

  it('tells nobody when the seller closed the auction by archiving the lot', () => {
    expect(
      recipientsOf({
        type: 'auction.closed',
        payload: { sellerId: 's1', outcome: 'NOT_SOLD', closedBy: 'ARCHIVE' },
      }),
    ).toEqual([]);
  });

  it('tells the previous winner and the seller that the checkout window ran out', () => {
    expect(
      recipientsOf({
        type: 'auction.winner_expired',
        payload: { sellerId: 's1', previousWinnerId: 'w1' },
      }),
    ).toEqual([
      { kind: 'user', userId: 'w1' },
      { kind: 'seller', sellerId: 's1' },
    ]);
  });

  it.each(['seller.approved', 'seller.rejected'] as const)(
    'tells the applicant about %s',
    (type) => {
      expect(recipientsOf({ type, payload: { userId: 'u1' } })).toEqual([
        { kind: 'user', userId: 'u1' },
      ]);
    },
  );

  it('tells the seller about a new dispute', () => {
    expect(
      recipientsOf({ type: 'dispute.opened', payload: { customerId: 'c1', sellerId: 's1' } }),
    ).toEqual([{ kind: 'seller', sellerId: 's1' }]);
  });

  it.each([
    ['CUSTOMER', [{ kind: 'seller', sellerId: 's1' }]],
    ['SELLER', [{ kind: 'user', userId: 'c1' }]],
    [
      'ADMIN',
      [
        { kind: 'user', userId: 'c1' },
        { kind: 'seller', sellerId: 's1' },
      ],
    ],
  ])('tells the other side about a dispute message from %s', (authorRole, expected) => {
    expect(
      recipientsOf({
        type: 'dispute.message_added',
        payload: { customerId: 'c1', sellerId: 's1', authorRole },
      }),
    ).toEqual(expected);
  });

  it('tells both sides that a dispute was resolved', () => {
    expect(
      recipientsOf({ type: 'dispute.resolved', payload: { customerId: 'c1', sellerId: 's1' } }),
    ).toEqual([
      { kind: 'user', userId: 'c1' },
      { kind: 'seller', sellerId: 's1' },
    ]);
  });
});
