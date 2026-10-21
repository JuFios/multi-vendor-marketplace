import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';

import { WS_EVENT, type WsEventName } from './ws-events';
import { productRoom, sellerRoom, userRoom } from './ws-rooms';

export interface Push {
  readonly room: string;
  readonly event: WsEventName;
  readonly payload: object;
}

/** Events that change an auction; its state is read fresh instead of rebuilt from the event. */
export const AUCTION_EVENT_TYPES = [
  EVENT_TYPE.AUCTION_STARTED,
  EVENT_TYPE.AUCTION_BID_PLACED,
  EVENT_TYPE.AUCTION_CLOSED,
  EVENT_TYPE.AUCTION_WINNER_EXPIRED,
  EVENT_TYPE.AUCTION_ORDERED,
] as const;

/** Every event type the realtime consumer turns into pushes. */
export const REALTIME_EVENT_TYPES = [
  ...AUCTION_EVENT_TYPES,
  EVENT_TYPE.PRODUCT_STOCK_CHANGED,
  EVENT_TYPE.SELLER_ORDER_CREATED,
  EVENT_TYPE.SELLER_ORDER_STATUS_CHANGED,
  EVENT_TYPE.SELLER_ORDER_PAYMENT_CHANGED,
  EVENT_TYPE.SELLER_ORDER_CANCELLED,
  EVENT_TYPE.ORDER_STATUS_CHANGED,
  EVENT_TYPE.REFUND_CREATED,
] as const;

/** A seller order starts like this (the column defaults), and `seller_order.created` omits both. */
const NEW_SELLER_ORDER = { status: 'NEW', version: 0 } as const;

/**
 * The pushes an event causes when its payload is enough. Each carries the version the client
 * compares, and the correlation id of the request behind the event.
 */
export function projectEvent(event: AnyDomainEvent): Push[] {
  const { correlationId } = event;
  switch (event.type) {
    case EVENT_TYPE.PRODUCT_STOCK_CHANGED: {
      const { productId, stock, version } = event.payload;
      return [
        {
          room: productRoom(productId),
          event: WS_EVENT.PRODUCT_STOCK,
          payload: { productId, stock, inStock: stock > 0, version, correlationId },
        },
      ];
    }
    case EVENT_TYPE.SELLER_ORDER_CREATED: {
      const { sellerOrderId, orderId, sellerId, amountCents } = event.payload;
      return [
        {
          room: sellerRoom(sellerId),
          event: WS_EVENT.SELLER_ORDER_CREATED,
          payload: { sellerOrderId, orderId, amountCents, ...NEW_SELLER_ORDER, correlationId },
        },
      ];
    }
    case EVENT_TYPE.SELLER_ORDER_STATUS_CHANGED: {
      // The order aggregate travels only with `order.status_changed`, at the order's version:
      // two sources for one merged field let a stale push overwrite a newer one. The buyer still
      // gets the seller order's own status, which the aggregate may not change at all.
      const p = event.payload;
      const payload = {
        sellerOrderId: p.sellerOrderId,
        orderId: p.orderId,
        status: p.to,
        version: p.version,
        correlationId,
      };
      return [
        { room: sellerRoom(p.sellerId), event: WS_EVENT.SELLER_ORDER_STATUS, payload },
        { room: userRoom(p.customerId), event: WS_EVENT.SELLER_ORDER_STATUS, payload },
      ];
    }
    case EVENT_TYPE.SELLER_ORDER_PAYMENT_CHANGED: {
      const p = event.payload;
      const payload = {
        sellerOrderId: p.sellerOrderId,
        orderId: p.orderId,
        paymentStatus: p.paymentStatus,
        version: p.version,
        correlationId,
      };
      return [
        { room: sellerRoom(p.sellerId), event: WS_EVENT.SELLER_ORDER_PAYMENT, payload },
        { room: userRoom(p.customerId), event: WS_EVENT.SELLER_ORDER_PAYMENT, payload },
      ];
    }
    case EVENT_TYPE.SELLER_ORDER_CANCELLED: {
      const p = event.payload;
      const payload = {
        sellerOrderId: p.sellerOrderId,
        orderId: p.orderId,
        reason: p.reason,
        actorType: p.actorType,
        restocked: p.restocked,
        correlationId,
      };
      return [
        { room: sellerRoom(p.sellerId), event: WS_EVENT.SELLER_ORDER_CANCELLED, payload },
        { room: userRoom(p.customerId), event: WS_EVENT.SELLER_ORDER_CANCELLED, payload },
      ];
    }
    case EVENT_TYPE.REFUND_CREATED: {
      const p = event.payload;
      const payload = {
        refundIds: p.refundIds,
        sellerOrderId: p.sellerOrderId,
        orderId: p.orderId,
        amountCents: p.amountCents,
        correlationId,
      };
      return [
        { room: userRoom(p.customerId), event: WS_EVENT.REFUND_CREATED, payload },
        { room: sellerRoom(p.sellerId), event: WS_EVENT.REFUND_CREATED, payload },
      ];
    }
    case EVENT_TYPE.ORDER_STATUS_CHANGED: {
      const p = event.payload;
      return [
        {
          room: userRoom(p.customerId),
          event: WS_EVENT.ORDER_STATUS,
          payload: {
            orderId: p.orderId,
            status: p.status,
            hasCancelledParts: p.hasCancelledParts,
            version: p.version,
            correlationId,
          },
        },
      ];
    }
    default:
      return [];
  }
}
