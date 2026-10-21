export const WS_NAMESPACE = '/realtime';

export const WS_CLIENT_MESSAGE = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
} as const;

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

export const WS_CHANNELS = ['product', 'auction'] as const;
export type WsChannel = (typeof WS_CHANNELS)[number];

export interface SubscribeRequest {
  readonly channel: WsChannel;
  readonly id: string;
}

export interface ProductStockPayload {
  readonly productId: string;
  readonly stock: number;
  readonly inStock: boolean;
  readonly version: number;
  readonly correlationId?: string | null;
}

export type AuctionStatus = 'ACTIVE' | 'SOLD_TO_WINNER' | 'ORDERED' | 'NOT_SOLD';

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

export interface OrderStatusPayload {
  readonly orderId: string;
  readonly status: string;
  readonly hasCancelledParts: boolean;
  readonly version: number;
  readonly correlationId?: string | null;
}

export interface SellerOrderCreatedPayload {
  readonly sellerOrderId: string;
  readonly orderId: string;
  readonly status: string;
  readonly amountCents: number;
  readonly version: number;
  readonly correlationId?: string | null;
}

export interface SellerOrderStatusPayload {
  readonly sellerOrderId: string;
  readonly orderId: string;
  readonly status: string;
  readonly version: number;
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

export type SubscribeAck =
  | { readonly ok: true; readonly snapshot: SubscribeSnapshot }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
    };

export const WS_UNAUTHORIZED = 'UNAUTHORIZED';

export function shouldApplyVersion(localVersion: number | undefined, incoming: number): boolean {
  return localVersion === undefined || incoming > localVersion;
}

export function channelKey(channel: WsChannel, id: string): string {
  return `${channel}:${id}`;
}
