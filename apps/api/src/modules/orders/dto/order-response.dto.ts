import { ApiProperty } from '@nestjs/swagger';

import type { OrderRecord, SellerOrderRecord } from '../order';

const ORDER_STATUSES = [
  'NEW',
  'PROCESSING',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
] as const;
const SELLER_ORDER_STATUSES = ['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const;
const PAYMENT_STATUSES = ['PENDING', 'CAPTURED', 'FAILED', 'REFUNDED'] as const;
const ACTORS = ['CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM'] as const;

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ description: 'The title when the order was placed.' })
  title: string;

  @ApiProperty({ description: 'The price when the order was placed, in kopecks.' })
  unitPriceCents: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  refundedQuantity: number;

  @ApiProperty()
  lineTotalCents: number;
}

export class StatusHistoryDto {
  @ApiProperty({ enum: SELLER_ORDER_STATUSES, nullable: true, type: String })
  from: string | null;

  @ApiProperty({ enum: SELLER_ORDER_STATUSES })
  to: string;

  @ApiProperty({ enum: ACTORS })
  actor: string;

  @ApiProperty({ nullable: true, type: String })
  reason: string | null;

  @ApiProperty({ format: 'date-time' })
  at: string;
}

class SellerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class SellerOrderDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: SellerDto })
  seller: SellerDto;

  @ApiProperty({ enum: SELLER_ORDER_STATUSES })
  status: string;

  @ApiProperty({ enum: PAYMENT_STATUSES })
  paymentStatus: string;

  @ApiProperty()
  subtotalCents: number;

  @ApiProperty()
  refundedCents: number;

  @ApiProperty({ description: 'The commission rate this order was priced with, in basis points.' })
  commissionRateBps: number;

  @ApiProperty({ description: 'The platform commission on this seller order.' })
  commissionCents: number;

  @ApiProperty({ description: 'What the seller receives.' })
  payoutCents: number;

  @ApiProperty({ type: [OrderItemDto] })
  items: OrderItemDto[];

  @ApiProperty({ type: [StatusHistoryDto] })
  statusHistory: StatusHistoryDto[];

  static from(record: SellerOrderRecord, storeNames: ReadonlyMap<string, string>): SellerOrderDto {
    return {
      id: record.id,
      seller: { id: record.sellerId, name: storeNames.get(record.sellerId) ?? '' },
      status: record.status,
      paymentStatus: record.paymentStatus,
      subtotalCents: record.subtotalCents,
      refundedCents: record.refundedCents,
      commissionRateBps: record.commissionRateBps,
      commissionCents: record.commissionCents,
      payoutCents: record.payoutCents,
      items: record.items.map((item) => ({
        productId: item.productId,
        title: item.title,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        refundedQuantity: item.refundedQuantity,
        lineTotalCents: item.unitPriceCents * item.quantity,
      })),
      statusHistory: record.statusHistory.map((entry) => ({
        from: entry.fromStatus,
        to: entry.toStatus,
        actor: entry.actorType,
        reason: entry.reason,
        at: entry.createdAt.toISOString(),
      })),
    };
  }
}

/** An order with its seller orders. Plain JSON: it is also stored as the replayed response. */
export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ORDER_STATUSES })
  status: string;

  @ApiProperty()
  hasCancelledParts: boolean;

  @ApiProperty()
  subtotalCents: number;

  @ApiProperty()
  refundedCents: number;

  @ApiProperty()
  totalCents: number;

  @ApiProperty({ description: 'The platform commission on the whole order.' })
  commissionCents: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: [SellerOrderDto] })
  sellerOrders: SellerOrderDto[];

  static from(record: OrderRecord, storeNames: ReadonlyMap<string, string>): OrderResponseDto {
    return {
      id: record.id,
      status: record.status,
      hasCancelledParts: record.hasCancelledParts,
      subtotalCents: record.subtotalCents,
      refundedCents: record.refundedCents,
      totalCents: record.totalCents,
      commissionCents: record.commissionCents,
      createdAt: record.createdAt.toISOString(),
      sellerOrders: record.sellerOrders.map((sellerOrder) =>
        SellerOrderDto.from(sellerOrder, storeNames),
      ),
    };
  }
}
