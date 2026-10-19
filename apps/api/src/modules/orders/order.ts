import type { OrderStatusValue, SellerOrderStatusValue } from './order-status';
import type { Actor, PaymentStatusValue } from './seller-order-state-machine';

export interface SellerOrderItemRecord {
  readonly id: string;
  readonly productId: string;
  readonly auctionId: string | null;
  readonly title: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly refundedQuantity: number;
  readonly refundedCents: number;
}

export interface StatusHistoryRecord {
  readonly fromStatus: SellerOrderStatusValue | null;
  readonly toStatus: SellerOrderStatusValue;
  readonly actorType: Actor;
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export interface SellerOrderRecord {
  readonly id: string;
  readonly orderId: string;
  readonly sellerId: string;
  readonly status: SellerOrderStatusValue;
  readonly paymentStatus: PaymentStatusValue;
  readonly subtotalCents: number;
  readonly refundedCents: number;
  readonly commissionRateBps: number;
  readonly commissionCents: number;
  readonly payoutCents: number;
  readonly cancelReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly items: readonly SellerOrderItemRecord[];
  readonly statusHistory: readonly StatusHistoryRecord[];
}

export interface OrderRecord {
  readonly id: string;
  readonly customerId: string;
  readonly status: OrderStatusValue;
  readonly hasCancelledParts: boolean;
  readonly subtotalCents: number;
  readonly refundedCents: number;
  readonly totalCents: number;
  readonly commissionCents: number;
  readonly createdAt: Date;
  readonly sellerOrders: readonly SellerOrderRecord[];
}
