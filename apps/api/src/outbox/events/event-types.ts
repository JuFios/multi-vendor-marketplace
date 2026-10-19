import type {
  ActorType,
  AuctionStatus,
  DisputeStatus,
  ModerationStatus,
  OrderStatus,
  SellerOrderStatus,
} from '../../generated/prisma/client';

/** Every domain event the system publishes through the outbox. */
export const EVENT_TYPE = {
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_ARCHIVED: 'product.archived',
  PRODUCT_MODERATED: 'product.moderated',
  PRODUCT_STOCK_CHANGED: 'product.stock_changed',
  PRODUCT_RATING_CHANGED: 'product.rating_changed',
  CATEGORY_UPDATED: 'category.updated',
  SELLER_APPROVED: 'seller.approved',
  SELLER_REJECTED: 'seller.rejected',
  AUCTION_STARTED: 'auction.started',
  AUCTION_BID_PLACED: 'auction.bid_placed',
  AUCTION_CLOSED: 'auction.closed',
  AUCTION_WINNER_EXPIRED: 'auction.winner_expired',
  AUCTION_ORDERED: 'auction.ordered',
  SELLER_ORDER_CREATED: 'seller_order.created',
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  SELLER_ORDER_STATUS_CHANGED: 'seller_order.status_changed',
  SELLER_ORDER_CANCELLED: 'seller_order.cancelled',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  REFUND_CREATED: 'refund.created',
  DISPUTE_OPENED: 'dispute.opened',
  DISPUTE_MESSAGE_ADDED: 'dispute.message_added',
  DISPUTE_RESOLVED: 'dispute.resolved',
} as const;

export const EVENT_TYPES = Object.values(EVENT_TYPE) satisfies readonly EventType[];

interface SellerDecisionPayload {
  sellerId: string;
  userId: string;
}

interface DisputePayload {
  disputeId: string;
  sellerOrderId: string;
}

/**
 * Payload of each event: ids plus the new state, and `version` where consumers need to
 * discard stale deliveries. Dates are ISO 8601 strings, money is integer cents.
 */
export interface EventPayloads {
  [EVENT_TYPE.PRODUCT_CREATED]: { productId: string; version: number };
  [EVENT_TYPE.PRODUCT_UPDATED]: { productId: string; version: number; changed: string[] };
  [EVENT_TYPE.PRODUCT_ARCHIVED]: { productId: string };
  [EVENT_TYPE.PRODUCT_MODERATED]: { productId: string; moderationStatus: ModerationStatus };
  [EVENT_TYPE.PRODUCT_STOCK_CHANGED]: { productId: string; stock: number; version: number };
  [EVENT_TYPE.PRODUCT_RATING_CHANGED]: {
    productId: string;
    ratingAvg: number;
    ratingCount: number;
  };
  [EVENT_TYPE.CATEGORY_UPDATED]: { categoryId: string };
  [EVENT_TYPE.SELLER_APPROVED]: SellerDecisionPayload;
  [EVENT_TYPE.SELLER_REJECTED]: SellerDecisionPayload & { reason?: string };
  [EVENT_TYPE.AUCTION_STARTED]: { auctionId: string; round: number; endsAt: string };
  [EVENT_TYPE.AUCTION_BID_PLACED]: {
    auctionId: string;
    productId: string;
    round: number;
    currentPriceCents: number;
    bidCount: number;
    version: number;
  };
  [EVENT_TYPE.AUCTION_CLOSED]: {
    auctionId: string;
    outcome: Extract<AuctionStatus, 'SOLD_TO_WINNER' | 'NOT_SOLD'>;
    winnerId?: string;
    priceCents?: number;
    winnerDeadlineAt?: string;
  };
  [EVENT_TYPE.AUCTION_WINNER_EXPIRED]: {
    auctionId: string;
    previousWinnerId: string;
    newRound: number;
  };
  [EVENT_TYPE.AUCTION_ORDERED]: { auctionId: string; orderId: string };
  [EVENT_TYPE.SELLER_ORDER_CREATED]: {
    sellerOrderId: string;
    orderId: string;
    sellerId: string;
    customerId: string;
    amountCents: number;
  };
  [EVENT_TYPE.PAYMENT_CAPTURED]: { sellerOrderId: string; paymentAttemptId: string };
  [EVENT_TYPE.PAYMENT_FAILED]: { sellerOrderId: string; reason: string };
  [EVENT_TYPE.SELLER_ORDER_STATUS_CHANGED]: {
    sellerOrderId: string;
    orderId: string;
    sellerId: string;
    from: SellerOrderStatus;
    to: SellerOrderStatus;
    version: number;
    payoutCents: number;
  };
  [EVENT_TYPE.SELLER_ORDER_CANCELLED]: {
    sellerOrderId: string;
    orderId: string;
    actorType: ActorType;
    reason: string;
    restocked: { productId: string; quantity: number }[];
  };
  [EVENT_TYPE.ORDER_STATUS_CHANGED]: {
    orderId: string;
    status: OrderStatus;
    hasCancelledParts: boolean;
    version: number;
  };
  [EVENT_TYPE.REFUND_CREATED]: {
    refundIds: string[];
    sellerOrderId: string;
    amountCents: number;
  };
  [EVENT_TYPE.DISPUTE_OPENED]: DisputePayload;
  [EVENT_TYPE.DISPUTE_MESSAGE_ADDED]: DisputePayload;
  [EVENT_TYPE.DISPUTE_RESOLVED]: DisputePayload & {
    outcome: Extract<DisputeStatus, 'RESOLVED_BUYER_FAVOR' | 'RESOLVED_SELLER_FAVOR'>;
  };
}

export type EventType = keyof EventPayloads;
