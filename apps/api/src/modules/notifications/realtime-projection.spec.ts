import type { AnyDomainEvent } from '../../outbox/events/domain-event';

import { projectEvent } from './realtime-projection';

const event = (type: string, payload: object): AnyDomainEvent =>
  ({
    id: 'e-1',
    type,
    aggregateType: 'X',
    aggregateId: 'x',
    occurredAt: '2026-01-01T00:00:00.000Z',
    correlationId: 'corr-1',
    actorId: null,
    schemaVersion: 1,
    payload,
  }) as unknown as AnyDomainEvent;

describe('projectEvent', () => {
  it('pushes the stock to the product room, derived from the event alone', () => {
    expect(
      projectEvent(event('product.stock_changed', { productId: 'p1', stock: 0, version: 4 })),
    ).toEqual([
      {
        room: 'product:p1',
        event: 'product.stock',
        payload: { productId: 'p1', stock: 0, inStock: false, version: 4, correlationId: 'corr-1' },
      },
    ]);
  });

  it('announces a seller order to the store as NEW at version 0', () => {
    const [push] = projectEvent(
      event('seller_order.created', {
        sellerOrderId: 'so1',
        orderId: 'o1',
        sellerId: 's1',
        customerId: 'c1',
        amountCents: 900,
      }),
    );

    expect(push).toEqual({
      room: 'seller:s1',
      event: 'sellerOrder.created',
      payload: {
        sellerOrderId: 'so1',
        orderId: 'o1',
        amountCents: 900,
        status: 'NEW',
        version: 0,
        correlationId: 'corr-1',
      },
    });
  });

  it('sends a seller order change to the store only; the aggregate travels with the order', () => {
    const pushes = projectEvent(
      event('seller_order.status_changed', {
        sellerOrderId: 'so1',
        orderId: 'o1',
        sellerId: 's1',
        customerId: 'c1',
        from: 'NEW',
        to: 'SHIPPED',
        version: 3,
        payoutCents: 0,
        orderStatus: 'PROCESSING',
        hasCancelledParts: true,
      }),
    );

    expect(pushes).toEqual([
      {
        room: 'seller:s1',
        event: 'sellerOrder.status',
        payload: {
          sellerOrderId: 'so1',
          orderId: 'o1',
          status: 'SHIPPED',
          version: 3,
          correlationId: 'corr-1',
        },
      },
    ]);
  });

  it('tells both sides of a seller order how its payment ended', () => {
    const pushes = projectEvent(
      event('seller_order.payment_changed', {
        sellerOrderId: 'so1',
        orderId: 'o1',
        sellerId: 's1',
        customerId: 'c1',
        paymentStatus: 'CAPTURED',
        version: 2,
      }),
    );

    expect(pushes.map(({ room }) => room)).toEqual(['seller:s1', 'user:c1']);
    expect(pushes[0]?.payload).toMatchObject({ paymentStatus: 'CAPTURED', version: 2 });
  });

  it('announces a cancellation and a refund to both sides', () => {
    const cancelled = projectEvent(
      event('seller_order.cancelled', {
        sellerOrderId: 'so1',
        orderId: 'o1',
        sellerId: 's1',
        customerId: 'c1',
        actorType: 'SYSTEM',
        reason: 'PAYMENT_FAILED',
        restocked: [{ productId: 'p1', quantity: 2 }],
      }),
    );
    expect(cancelled.map(({ room, event: name }) => [room, name])).toEqual([
      ['seller:s1', 'sellerOrder.cancelled'],
      ['user:c1', 'sellerOrder.cancelled'],
    ]);

    const refund = projectEvent(
      event('refund.created', {
        refundIds: ['r1'],
        sellerOrderId: 'so1',
        orderId: 'o1',
        sellerId: 's1',
        customerId: 'c1',
        amountCents: 500,
      }),
    );
    expect(refund.map(({ room, event: name }) => [room, name])).toEqual([
      ['user:c1', 'refund.created'],
      ['seller:s1', 'refund.created'],
    ]);
    expect(refund[0]?.payload).toMatchObject({ refundIds: ['r1'], amountCents: 500 });
  });

  it('sends an order change to its customer', () => {
    expect(
      projectEvent(
        event('order.status_changed', {
          orderId: 'o1',
          customerId: 'c1',
          status: 'COMPLETED',
          hasCancelledParts: false,
          version: 2,
        }),
      ),
    ).toEqual([
      {
        room: 'user:c1',
        event: 'order.status',
        payload: {
          orderId: 'o1',
          status: 'COMPLETED',
          hasCancelledParts: false,
          version: 2,
          correlationId: 'corr-1',
        },
      },
    ]);
  });

  it('pushes nothing for events without a live view', () => {
    expect(projectEvent(event('payment.captured', { sellerOrderId: 'so1' }))).toEqual([]);
  });
});
