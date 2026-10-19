import { QUEUE, type QueueName } from '../../queue';

import { EVENT_TYPE, type EventType } from './event-types';

export type EventRoutes = Readonly<Record<EventType, readonly QueueName[]>>;

/** Injection token for the routing table, so tests can route a test event without touching it. */
export const EVENT_ROUTING = Symbol('EVENT_ROUTING');

/**
 * Static routing table: the queues each event type is published to. An empty list is an
 * explicit "nobody consumes this yet"; every feature that adds a consumer adds its queue here.
 */
export const EVENT_ROUTES: EventRoutes = {
  [EVENT_TYPE.PRODUCT_CREATED]: [],
  [EVENT_TYPE.PRODUCT_UPDATED]: [QUEUE.CACHE],
  [EVENT_TYPE.PRODUCT_ARCHIVED]: [QUEUE.CACHE],
  [EVENT_TYPE.PRODUCT_MODERATED]: [QUEUE.CACHE],
  [EVENT_TYPE.PRODUCT_STOCK_CHANGED]: [QUEUE.CACHE],
  [EVENT_TYPE.PRODUCT_RATING_CHANGED]: [QUEUE.CACHE],
  [EVENT_TYPE.CATEGORY_UPDATED]: [],
  [EVENT_TYPE.SELLER_APPROVED]: [],
  [EVENT_TYPE.SELLER_REJECTED]: [],
  [EVENT_TYPE.AUCTION_STARTED]: [],
  [EVENT_TYPE.AUCTION_BID_PLACED]: [],
  [EVENT_TYPE.AUCTION_CLOSED]: [],
  [EVENT_TYPE.AUCTION_WINNER_EXPIRED]: [],
  [EVENT_TYPE.AUCTION_ORDERED]: [],
  [EVENT_TYPE.SELLER_ORDER_CREATED]: [],
  [EVENT_TYPE.PAYMENT_CAPTURED]: [],
  [EVENT_TYPE.PAYMENT_FAILED]: [],
  [EVENT_TYPE.SELLER_ORDER_STATUS_CHANGED]: [],
  [EVENT_TYPE.SELLER_ORDER_CANCELLED]: [],
  [EVENT_TYPE.ORDER_STATUS_CHANGED]: [],
  [EVENT_TYPE.REFUND_CREATED]: [],
  [EVENT_TYPE.DISPUTE_OPENED]: [],
  [EVENT_TYPE.DISPUTE_MESSAGE_ADDED]: [],
  [EVENT_TYPE.DISPUTE_RESOLVED]: [],
};
