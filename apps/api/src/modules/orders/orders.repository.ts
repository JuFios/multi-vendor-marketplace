import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { getCorrelationId } from '../../common/cls';
import type { Prisma } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma';

import type { OrderRecord, SellerOrderRecord } from './order';
import type { OrderStatusValue, SellerOrderStatusValue } from './order-status';
import type { SellerGroup } from './split-cart';

export interface CheckoutItem {
  readonly sellerId: string;
  readonly productId: string;
  readonly title: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
}

const SELLER_ORDER_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SellerOrderInclude;

type SellerOrderRow = Prisma.SellerOrderGetPayload<{ include: typeof SELLER_ORDER_INCLUDE }>;
type OrderRow = Prisma.OrderGetPayload<{
  include: { sellerOrders: { include: typeof SELLER_ORDER_INCLUDE } };
}>;

const toSellerOrder = (row: SellerOrderRow): SellerOrderRecord => ({
  id: row.id,
  orderId: row.orderId,
  sellerId: row.sellerId,
  status: row.status,
  paymentStatus: row.paymentStatus,
  subtotalCents: row.subtotalCents,
  refundedCents: row.refundedCents,
  commissionRateBps: row.commissionRateBps,
  commissionCents: row.commissionCents,
  payoutCents: row.payoutCents,
  cancelReason: row.cancelReason,
  createdAt: row.createdAt,
  items: row.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    auctionId: item.auctionId,
    title: item.titleSnapshot,
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
    refundedQuantity: item.refundedQuantity,
    refundedCents: item.refundedCents,
  })),
  statusHistory: row.statusHistory.map((entry) => ({
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actorType: entry.actorType,
    actorId: entry.actorId,
    reason: entry.reason,
    createdAt: entry.createdAt,
  })),
});

const toOrder = (row: OrderRow): OrderRecord => ({
  id: row.id,
  customerId: row.customerId,
  status: row.status,
  hasCancelledParts: row.hasCancelledParts,
  subtotalCents: row.subtotalCents,
  refundedCents: row.refundedCents,
  totalCents: row.totalCents,
  commissionCents: row.commissionCents,
  createdAt: row.createdAt,
  sellerOrders: row.sellerOrders.map(toSellerOrder),
});

/** Owns `orders`, `seller_orders`, their items and status history. */
@Injectable()
export class OrdersRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /** An order with one seller order per group, each NEW with its first history row. */
  async create(
    customerId: string,
    groups: readonly SellerGroup<CheckoutItem>[],
    commissionRateBps: number,
  ): Promise<OrderRecord> {
    const subtotalCents = groups.reduce((sum, group) => sum + group.subtotalCents, 0);
    const commissionCents = groups.reduce((sum, group) => sum + group.commissionCents, 0);
    const row = await this.txHost.tx.order.create({
      data: {
        customerId,
        subtotalCents,
        totalCents: subtotalCents,
        commissionCents,
        correlationId: getCorrelationId() ?? null,
        sellerOrders: {
          create: groups.map((group) => ({
            sellerId: group.sellerId,
            subtotalCents: group.subtotalCents,
            commissionRateBps,
            commissionCents: group.commissionCents,
            payoutCents: group.payoutCents,
            items: {
              create: group.items.map((item) => ({
                productId: item.productId,
                titleSnapshot: item.title,
                unitPriceCents: item.unitPriceCents,
                quantity: item.quantity,
              })),
            },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: 'NEW',
                actorType: 'CUSTOMER',
                actorId: customerId,
              },
            },
          })),
        },
      },
      include: { sellerOrders: { include: SELLER_ORDER_INCLUDE } },
    });
    const order = toOrder(row);
    const position = new Map(groups.map((group, index) => [group.sellerId, index]));
    return {
      ...order,
      sellerOrders: [...order.sellerOrders].sort(
        (a, b) => (position.get(a.sellerId) ?? 0) - (position.get(b.sellerId) ?? 0),
      ),
    };
  }

  async findOfCustomer(id: string, customerId: string): Promise<OrderRecord | null> {
    const row = await this.txHost.tx.order.findFirst({
      where: { id, customerId },
      include: { sellerOrders: { include: SELLER_ORDER_INCLUDE } },
    });
    return row && toOrder(row);
  }

  listOfCustomer(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<{ items: OrderRecord[]; total: number }> {
    return this.listOrders({ customerId }, page, limit);
  }

  async findById(id: string): Promise<OrderRecord | null> {
    const row = await this.txHost.tx.order.findUnique({
      where: { id },
      include: { sellerOrders: { include: SELLER_ORDER_INCLUDE } },
    });
    return row && toOrder(row);
  }

  listAll(
    status: OrderStatusValue | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: OrderRecord[]; total: number }> {
    return this.listOrders(status === undefined ? {} : { status }, page, limit);
  }

  async findSellerOrderOf(id: string, sellerId: string): Promise<SellerOrderRecord | null> {
    const row = await this.txHost.tx.sellerOrder.findFirst({
      where: { id, sellerId },
      include: SELLER_ORDER_INCLUDE,
    });
    return row && toSellerOrder(row);
  }

  async listSellerOrdersOf(
    sellerId: string,
    status: SellerOrderStatusValue | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: SellerOrderRecord[]; total: number }> {
    const where: Prisma.SellerOrderWhereInput =
      status === undefined ? { sellerId } : { sellerId, status };
    const [rows, total] = await Promise.all([
      this.txHost.tx.sellerOrder.findMany({
        where,
        include: SELLER_ORDER_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.txHost.tx.sellerOrder.count({ where }),
    ]);
    return { items: rows.map(toSellerOrder), total };
  }

  private async listOrders(
    where: Prisma.OrderWhereInput,
    page: number,
    limit: number,
  ): Promise<{ items: OrderRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.txHost.tx.order.findMany({
        where,
        include: { sellerOrders: { include: SELLER_ORDER_INCLUDE } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.txHost.tx.order.count({ where }),
    ]);
    return { items: rows.map(toOrder), total };
  }
}
