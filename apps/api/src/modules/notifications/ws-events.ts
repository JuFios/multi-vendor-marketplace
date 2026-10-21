import type { EventPayloads } from '../../outbox/events/event-types';
import type { AuctionStatus } from '../bidding/auction';
import type { OrderStatusValue, SellerOrderStatusValue } from '../orders/order-status';
import type { PaymentStatusValue } from '../orders/seller-order-state-machine';

/** Socket.IO namespace every realtime connection joins. */
export const WS_NAMESPACE = '/realtime';

/** Messages a client sends. */
export const WS_CLIENT_MESSAGE = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
} as const;

/**
 * Events the server pushes. The ones that mirror state a client merges carry a `version`;
 * `refund.created` and `sellerOrder.cancelled` are append-only notices and carry ids instead.
 */
export const WS_EVENT = {
  PRODUCT_STOCK: 'product.stock',
  AUCTION_STATE: 'auction.state',
  ORDER_STATUS: 'order.status',
  SELLER_ORDER_CREATED: 'sellerOrder.created',
  SELLER_ORDER_STATUS: 'sellerOrder.status',
  SELLER_ORDER_PAYMENT: 'sellerOrder.payment',
  SELLER_ORDER_CANCELLED: 'sellerOrder.cancelled',
  REFUND_CREATED: 'refund.created',
  NOTIFICATION: 'notification',
} as const;

export type WsEventName = (typeof WS_EVENT)[keyof typeof WS_EVENT];

/** Channels a client can follow; `user:*` and `seller:*` rooms are joined from the token. */
export const WS_CHANNELS = ['product', 'auction'] as const;
export type WsChannel = (typeof WS_CHANNELS)[number];

export interface SubscribeRequest {
  readonly channel: WsChannel;
  readonly id: string;
}

/** Stock of a product; `version` grows with every change. */
export interface ProductStockPayload {
  readonly productId: string;
  readonly stock: number;
  readonly inStock: boolean;
  readonly version: number;
  readonly correlationId?: string | null;
}

/**
 * State of an auction. The leader is masked like in the bid history: the room is public.
 * `serverTime` is the database clock, for correcting the countdown of a client.
 */
export interface AuctionStatePayload {
  readonly auctionId: string;
  readonly productId: string;
  readonly round: number;
  readonly status: AuctionStatus;
  readonly currentPriceCents: number | null;
  readonly minNextBidCents: number | null;
  readonly bidCount: number;
  readonly leader: string | null;
  readonly endsAt: string;
  readonly winnerDeadlineAt: string | null;
  readonly version: number;
  readonly serverTime: string;
  readonly correlationId?: string | null;
}

/**
 * Status of an order for its customer; `version` is the order's own, so a client keeps the
 * latest push per order and ignores the rest.
 */
export interface OrderStatusPayload {
  readonly orderId: string;
  readonly status: OrderStatusValue;
  readonly hasCancelledParts: boolean;
  readonly version: number;
  readonly correlationId?: string | null;
}

/** A seller order appeared in the store; it starts as NEW at version 0. */
export interface SellerOrderCreatedPayload {
  readonly sellerOrderId: string;
  readonly orderId: string;
  readonly status: SellerOrderStatusValue;
  readonly amountCents: number;
  readonly version: number;
  readonly correlationId?: string | null;
}

export interface SellerOrderStatusPayload {
  readonly sellerOrderId: string;
  readonly orderId: string;
  readonly status: SellerOrderStatusValue;
  readonly version: number;
  readonly correlationId?: string | null;
}

/** Payment outcome of a seller order; `version` is the seller order's. */
export interface SellerOrderPaymentPayload {
  readonly sellerOrderId: string;
  readonly orderId: string;
  readonly paymentStatus: PaymentStatusValue;
  readonly version: number;
  readonly correlationId?: string | null;
}

/** A seller order was cancelled: the reason and the stock that came back. */
export interface SellerOrderCancelledPayload {
  readonly sellerOrderId: string;
  readonly orderId: string;
  readonly reason: string;
  readonly actorType: EventPayloads['seller_order.cancelled']['actorType'];
  readonly restocked: readonly { readonly productId: string; readonly quantity: number }[];
  readonly correlationId?: string | null;
}

/** Money returned for a seller order; the ids let a client refresh its refund list. */
export interface RefundCreatedPayload {
  readonly refundIds: readonly string[];
  readonly sellerOrderId: string;
  readonly orderId: string;
  readonly amountCents: number;
  readonly correlationId?: string | null;
}

export interface NotificationPayload {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

export type SubscribeSnapshot =
  | { readonly channel: 'product'; readonly state: ProductStockPayload }
  | { readonly channel: 'auction'; readonly state: AuctionStatePayload };

export const WS_ERROR_CODE = {
  INVALID_SUBSCRIPTION: 'INVALID_SUBSCRIPTION',
  SUBSCRIPTION_LIMIT: 'SUBSCRIPTION_LIMIT',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
} as const;

export type WsErrorCode = (typeof WS_ERROR_CODE)[keyof typeof WS_ERROR_CODE];

/** What `subscribe` answers with: the current state, so a reconnecting client resyncs at once. */
export type SubscribeAck =
  | { readonly ok: true; readonly snapshot: SubscribeSnapshot }
  | {
      readonly ok: false;
      readonly error: { readonly code: WsErrorCode; readonly message: string };
    };

export type UnsubscribeAck = { readonly ok: true } | Extract<SubscribeAck, { ok: false }>;

/** The error a handshake with a bad token is refused with (`connect_error.message`). */
export const WS_UNAUTHORIZED = 'UNAUTHORIZED';
