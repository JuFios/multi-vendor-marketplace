/** Names of the BullMQ queues; each processor listens on exactly one of them. */
export const QUEUE = {
  SEARCH_SYNC: 'search-sync',
  CACHE: 'cache',
  REALTIME: 'realtime',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
  ORDERS_SAGA: 'orders-saga',
  PAYOUTS: 'payouts',
  ANALYTICS: 'analytics',
  CART: 'cart',
  AUCTIONS: 'auctions',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const QUEUE_NAMES: readonly QueueName[] = Object.values(QUEUE);
