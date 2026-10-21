import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { getCorrelationId } from '../../common/cls/correlation-context';
import type { Prisma } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';

import type { OrderRecord, SellerOrderRecord } from './order';
import type {
  AggregatedOrderStatus,
  OrderStatusValue,
  SellerOrderStatusValue,
} from './order-status';
import type { RefundPlan } from './refund';
import type { RefundSource, SaleSource } from './sales-facts';
import type { Actor, PaymentStatusValue } from './seller-order-state-machine';
import type { SellerGroup } from './split-cart';

export interface RefundRecord {
  readonly id: string;
  readonly sellerOrderItemId: string;
  readonly quantity: number;
  readonly amountCents: number;
}

export interface CheckoutItem {
  readonly sellerId: string;
  readonly productId: string;
  readonly title: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  /** Set on an auction lot; its price is the winning bid. */
  readonly auctionId?: string;
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
  version: row.version,
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
                ...(item.auctionId === undefined ? {} : { auctionId: item.auctionId }),
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

  /** Seller orders of the store placed on a day of the period (in `timeZone`), by status. */
  async countSellerOrdersByStatus(
    sellerId: string,
    period: { from: string; to: string },
    timeZone: string,
  ): Promise<Map<SellerOrderStatusValue, number>> {
    const rows = await this.txHost.tx.$queryRaw<
      { status: SellerOrderStatusValue; count: number }[]
    >`
      SELECT status::text AS status, count(*)::int AS count
      FROM seller_orders
      WHERE seller_id = ${sellerId}::uuid
        AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date
            BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY status`;
    return new Map(rows.map((row) => [row.status, row.count]));
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

  /**
   * Locks the order that owns the seller order, so concurrent changes to its seller orders run
   * one after another and the aggregate never misses an update. Null when there is no such
   * seller order.
   */
  async lockOrderOf(
    sellerOrderId: string,
  ): Promise<{ orderId: string; customerId: string } | null> {
    const rows = await this.txHost.tx.$queryRaw<{ id: string; customer_id: string }[]>`
      SELECT o.id, o.customer_id FROM orders o
      JOIN seller_orders so ON so.order_id = o.id
      WHERE so.id = ${sellerOrderId}::uuid
      FOR UPDATE OF o`;
    const row = rows[0];
    return row ? { orderId: row.id, customerId: row.customer_id } : null;
  }

  /** An item of the product in one of the customer's completed seller orders, if any. */
  /** An item of a completed seller order the customer kept: a fully refunded one does not count. */
  async findCompletedItemId(customerId: string, productId: string): Promise<string | null> {
    const rows = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      SELECT i.id
      FROM seller_order_items AS i
      JOIN seller_orders AS so ON so.id = i.seller_order_id
      JOIN orders AS o ON o.id = so.order_id
      WHERE i.product_id = ${productId}::uuid AND o.customer_id = ${customerId}::uuid
        AND so.status = 'COMPLETED' AND i.refunded_quantity < i.quantity
      ORDER BY i.id
      LIMIT 1`;
    return rows[0]?.id ?? null;
  }

  async findSellerOrder(id: string): Promise<SellerOrderRecord | null> {
    const row = await this.txHost.tx.sellerOrder.findUnique({
      where: { id },
      include: SELLER_ORDER_INCLUDE,
    });
    return row && toSellerOrder(row);
  }

  async statusesOfOrder(orderId: string): Promise<SellerOrderStatusValue[]> {
    const rows = await this.txHost.tx.sellerOrder.findMany({
      where: { orderId },
      select: { status: true },
    });
    return rows.map((row) => row.status);
  }

  /** Moves the seller order to `to` and writes the history row; returns its new version. */
  async changeSellerOrderStatus(
    sellerOrderId: string,
    from: SellerOrderStatusValue,
    to: SellerOrderStatusValue,
    actor: { type: Actor; userId: string | null },
    reason: string | null,
  ): Promise<number> {
    const row = await this.txHost.tx.sellerOrder.update({
      where: { id: sellerOrderId },
      data: { status: to, version: { increment: 1 } },
      select: { version: true },
    });
    await this.txHost.tx.sellerOrderStatusHistory.create({
      data: {
        sellerOrderId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.userId,
        reason,
      },
    });
    return row.version;
  }

  /** Writes the aggregate onto the order; returns the new version, or null when nothing changed. */
  async applyAggregate(orderId: string, aggregate: AggregatedOrderStatus): Promise<number | null> {
    const { count } = await this.txHost.tx.order.updateMany({
      where: {
        id: orderId,
        OR: [
          { status: { not: aggregate.status } },
          { hasCancelledParts: { not: aggregate.hasCancelledParts } },
        ],
      },
      data: {
        status: aggregate.status,
        hasCancelledParts: aggregate.hasCancelledParts,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      return null;
    }
    const row = await this.txHost.tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { version: true },
    });
    return row.version;
  }

  /**
   * Cancels the seller order: no commission or payout is left, and a captured payment is
   * marked refunded. Returns the new version.
   */
  async cancelSellerOrder(
    sellerOrderId: string,
    from: SellerOrderStatusValue,
    actor: { type: Actor; userId: string | null },
    reason: string,
  ): Promise<number> {
    const current = await this.txHost.tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      select: { paymentStatus: true },
    });
    const row = await this.txHost.tx.sellerOrder.update({
      where: { id: sellerOrderId },
      data: {
        status: 'CANCELLED',
        cancelReason: reason,
        cancelledBy: actor.type,
        commissionCents: 0,
        payoutCents: 0,
        paymentStatus: current.paymentStatus === 'CAPTURED' ? 'REFUNDED' : current.paymentStatus,
        version: { increment: 1 },
      },
      select: { version: true },
    });
    await this.txHost.tx.sellerOrderStatusHistory.create({
      data: {
        sellerOrderId,
        fromStatus: from,
        toStatus: 'CANCELLED',
        actorType: actor.type,
        actorId: actor.userId,
        reason,
      },
    });
    return row.version;
  }

  /** The stored figures of a seller order, with its creation day in `timeZone` (database time). */
  async findSaleSource(sellerOrderId: string, timeZone: string): Promise<SaleSource | null> {
    const row = await this.txHost.tx.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      select: {
        sellerId: true,
        subtotalCents: true,
        refundedCents: true,
        commissionRateBps: true,
        items: {
          select: { productId: true, quantity: true, unitPriceCents: true, refundedCents: true },
        },
      },
    });
    if (row === null) {
      return null;
    }
    return { sellerOrderId, ...row, day: await this.dayOf(sellerOrderId, timeZone) };
  }

  /** A batch of refunds of one seller order, and the amount refunded on it before the batch. */
  async findRefundSource(
    sellerOrderId: string,
    refundIds: readonly string[],
    timeZone: string,
  ): Promise<RefundSource | null> {
    const tx = this.txHost.tx;
    const [order, refunds] = await Promise.all([
      tx.sellerOrder.findUnique({
        where: { id: sellerOrderId },
        select: { sellerId: true, subtotalCents: true, commissionRateBps: true },
      }),
      tx.refund.findMany({
        where: { sellerOrderId, id: { in: [...refundIds] } },
        select: {
          amountCents: true,
          createdAt: true,
          sellerOrderItem: { select: { productId: true } },
        },
      }),
    ]);
    const first = refunds.map((refund) => refund.createdAt.getTime()).sort((a, b) => a - b)[0];
    if (order === null || first === undefined) {
      return null;
    }
    const before = await tx.refund.aggregate({
      where: {
        sellerOrderId,
        id: { notIn: [...refundIds] },
        createdAt: { lt: new Date(first) },
      },
      _sum: { amountCents: true },
    });
    return {
      sellerOrderId,
      ...order,
      day: await this.dayOf(sellerOrderId, timeZone),
      refundedBeforeCents: before._sum.amountCents ?? 0,
      lines: refunds.map((refund) => ({
        productId: refund.sellerOrderItem.productId,
        amountCents: refund.amountCents,
      })),
    };
  }

  private async dayOf(sellerOrderId: string, timeZone: string): Promise<string> {
    const [row] = await this.txHost.tx.$queryRaw<{ day: string }[]>`
      SELECT to_char(((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day
      FROM seller_orders
      WHERE id = ${sellerOrderId}::uuid`;
    if (row === undefined) {
      throw new Error(`seller order ${sellerOrderId} disappeared while reading its day`);
    }
    return row.day;
  }

  /** Books the refunded or cancelled amount on the order and re-sums its commission. */
  async bookRefundedOnOrder(orderId: string, amountCents: number): Promise<void> {
    const commission = await this.txHost.tx.sellerOrder.aggregate({
      where: { orderId },
      _sum: { commissionCents: true },
    });
    await this.txHost.tx.order.update({
      where: { id: orderId },
      data: {
        refundedCents: { increment: amountCents },
        totalCents: { decrement: amountCents },
        commissionCents: commission._sum.commissionCents ?? 0,
      },
    });
  }

  /**
   * Books a refund on the seller order and its items, and writes one `refunds` row per line.
   * The caller holds the order lock, so the absolute totals of the plan cannot be stale.
   */
  async applyRefund(
    sellerOrderId: string,
    plan: RefundPlan,
    refund: { reason: string; actor: { type: Actor; userId: string }; disputeId?: string },
  ): Promise<RefundRecord[]> {
    const tx = this.txHost.tx;
    for (const line of plan.lines) {
      await tx.sellerOrderItem.update({
        where: { id: line.sellerOrderItemId },
        data: {
          refundedQuantity: { increment: line.quantity },
          refundedCents: { increment: line.amountCents },
        },
      });
    }
    const rows = await tx.refund.createManyAndReturn({
      data: plan.lines.map((line) => ({
        sellerOrderId,
        sellerOrderItemId: line.sellerOrderItemId,
        quantity: line.quantity,
        amountCents: line.amountCents,
        reason: refund.reason,
        actorType: refund.actor.type,
        actorId: refund.actor.userId,
        ...(refund.disputeId === undefined ? {} : { disputeId: refund.disputeId }),
      })),
      select: { id: true, sellerOrderItemId: true, quantity: true, amountCents: true },
    });
    await tx.sellerOrder.update({
      where: { id: sellerOrderId },
      data: {
        refundedCents: plan.refundedCents,
        commissionCents: plan.commissionCents,
        payoutCents: plan.payoutCents,
        version: { increment: 1 },
      },
    });
    const order = new Map(plan.lines.map((line, index) => [line.sellerOrderItemId, index]));
    return rows.sort(
      (a, b) => (order.get(a.sellerOrderItemId) ?? 0) - (order.get(b.sellerOrderItemId) ?? 0),
    );
  }

  /**
   * Moves the payment status from `from` to `to` and returns the seller order's new version;
   * null when it was not in `from`.
   */
  async changePaymentStatus(
    sellerOrderId: string,
    from: PaymentStatusValue,
    to: PaymentStatusValue,
  ): Promise<number | null> {
    const { count } = await this.txHost.tx.sellerOrder.updateMany({
      where: { id: sellerOrderId, paymentStatus: from },
      data: { paymentStatus: to, version: { increment: 1 } },
    });
    if (count === 0) {
      return null;
    }
    const row = await this.txHost.tx.sellerOrder.findUniqueOrThrow({
      where: { id: sellerOrderId },
      select: { version: true },
    });
    return row.version;
  }
}
