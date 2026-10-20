import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';

import type { AnyDomainEvent } from '../../src/outbox/events/domain-event';
import { newEventId } from '../../src/outbox/events/event-id';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import { QUEUE } from '../../src/queue/queue-names';
import { QUEUE_PUBLISHER, type QueuePublisherPort } from '../../src/queue/queue-publisher.port';
import type { CreatedSellerOrder } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';

export function sellerOrderCreated(made: CreatedSellerOrder): AnyDomainEvent {
  return {
    id: newEventId(),
    type: EVENT_TYPE.SELLER_ORDER_CREATED,
    aggregateType: 'seller_order',
    aggregateId: made.sellerOrder.id,
    occurredAt: new Date().toISOString(),
    correlationId: null,
    actorId: null,
    schemaVersion: 1,
    payload: {
      sellerOrderId: made.sellerOrder.id,
      orderId: made.order.id,
      sellerId: made.sellerOrder.sellerId,
      customerId: randomUUID(),
      amountCents: made.sellerOrder.subtotalCents,
    },
  };
}

/** Hands an event to the analytics consumer only, as the relay would. */
export function deliverToAnalytics(
  app: NestExpressApplication,
  event: AnyDomainEvent,
): Promise<void> {
  return app.get<QueuePublisherPort>(QUEUE_PUBLISHER).publish(QUEUE.ANALYTICS, event);
}

/** Books each order in the read models, as its `seller_order.created` event would. */
export async function bookOrders(
  app: NestExpressApplication,
  orders: readonly CreatedSellerOrder[],
): Promise<void> {
  for (const made of orders) {
    await deliverToAnalytics(app, sellerOrderCreated(made));
  }
  await flushEvents({ app });
}
