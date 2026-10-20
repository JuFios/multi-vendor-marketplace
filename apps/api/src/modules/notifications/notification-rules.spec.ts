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

  it.each(['seller.approved', 'seller.rejected'] as const)(
    'tells the applicant about %s',
    (type) => {
      expect(recipientsOf({ type, payload: { userId: 'u1' } })).toEqual([
        { kind: 'user', userId: 'u1' },
      ]);
    },
  );
});
