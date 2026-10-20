import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { SELLER_ORDERS_CANCELLED_TOTAL } from '../../metrics/metrics.constants';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import { AuctionLifecycleService } from '../bidding/auction-lifecycle.service';
import { LedgerService } from '../payments-ledger/ledger.service';
import { InventoryService } from '../products/inventory.service';
import { SellersService } from '../sellers/sellers.service';

import { planCancellation } from './cancellation';
import { SellerOrderDto } from './dto/order-response.dto';
import type { SellerOrderRecord } from './order';
import { aggregateOrderStatus, type SellerOrderStatusValue } from './order-status';
import { SellerOrderNotFoundError } from './orders.errors';
import { OrdersRepository } from './orders.repository';
import { type Actor, assertTransition } from './seller-order-state-machine';

export interface LifecycleActor {
  readonly type: Actor;
  readonly userId: string | null;
}

/** Who may see the seller order; anything else is reported as not found. */
export interface Ownership {
  readonly sellerId?: string;
  readonly customerId?: string;
  readonly orderId?: string;
}

export interface LockedSellerOrder {
  readonly sellerOrder: SellerOrderRecord;
  readonly customerId: string;
}

/** Status changes of single seller orders; the order's aggregate follows in the same transaction. */
@Injectable()
export class SellerOrderLifecycleService {
  private readonly logger = new Logger(SellerOrderLifecycleService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    @InjectMetric(SELLER_ORDERS_CANCELLED_TOTAL) private readonly cancelled: Counter<'actor'>,
    private readonly orders: OrdersRepository,
    private readonly sellers: SellersService,
    private readonly outbox: OutboxService,
    private readonly inventory: InventoryService,
    private readonly ledger: LedgerService,
    private readonly auctionLifecycle: AuctionLifecycleService,
  ) {}

  async changeStatus(
    sellerOrderId: string,
    to: SellerOrderStatusValue,
    actor: LifecycleActor,
    ownership: Ownership,
  ): Promise<SellerOrderDto> {
    const result = await this.txHost.withTransaction(async () => {
      const { sellerOrder, customerId } = await this.lockAndLoad(sellerOrderId, ownership);
      assertTransition(sellerOrder.status, to, actor.type, {
        paymentStatus: sellerOrder.paymentStatus,
      });
      const version = await this.orders.changeSellerOrderStatus(
        sellerOrder.id,
        sellerOrder.status,
        to,
        actor,
        null,
      );
      await this.recordChange(sellerOrder, customerId, to, version, actor.userId);
      return { sellerOrder, updated: await this.requireSellerOrder(sellerOrderId) };
    });
    this.logger.log({
      msg: 'seller_order.status_changed',
      sellerOrderId,
      from: result.sellerOrder.status,
      to,
      actor: actor.type,
    });
    return SellerOrderDto.from(
      result.updated,
      await this.sellers.findStoreNames([result.updated.sellerId]),
    );
  }

  /**
   * Cancels one seller order and nothing else: its stock goes back, its books are reversed and
   * the order's totals and aggregate follow, all in one transaction.
   */
  async cancel(
    sellerOrderId: string,
    reason: string,
    actor: LifecycleActor,
    ownership: Ownership,
    options: { viaDispute?: boolean } = {},
  ): Promise<SellerOrderDto> {
    const result = await this.txHost.withTransaction(async () => {
      const { sellerOrder, customerId } = await this.lockAndLoad(sellerOrderId, ownership);
      assertTransition(sellerOrder.status, 'CANCELLED', actor.type, {
        paymentStatus: sellerOrder.paymentStatus,
        ...(options.viaDispute === undefined ? {} : { viaDispute: options.viaDispute }),
      });

      // Shipped goods are not restocked and their auction lots are not offered again (I-08).
      const goodsStillWithSeller =
        sellerOrder.status === 'NEW' || sellerOrder.status === 'PROCESSING';
      const restocked = goodsStillWithSeller
        ? sellerOrder.items
            .filter((item) => item.auctionId === null)
            .map((item) => ({ productId: item.productId, quantity: item.quantity }))
        : [];
      await this.inventory.restock(restocked);
      // A cancelled auction lot is offered again as a new round (I-03).
      const lots = goodsStillWithSeller
        ? sellerOrder.items
            .flatMap((item) => (item.auctionId === null ? [] : [item.auctionId]))
            .sort()
        : [];
      for (const auctionId of lots) {
        await this.auctionLifecycle.restartIfOrdered(auctionId);
      }

      const plan = planCancellation(sellerOrder);
      await this.ledger.recordCancellation({
        sellerOrderId: sellerOrder.id,
        sellerId: sellerOrder.sellerId,
        releasedCents: plan.releasedCents,
        commissionCents: plan.commissionReversalCents,
      });
      const version = await this.orders.cancelSellerOrder(
        sellerOrder.id,
        sellerOrder.status,
        actor,
        reason,
      );
      await this.orders.bookRefundedOnOrder(sellerOrder.orderId, plan.releasedCents);
      await this.outbox.add([
        {
          type: EVENT_TYPE.SELLER_ORDER_CANCELLED,
          aggregateType: 'SellerOrder',
          aggregateId: sellerOrder.id,
          payload: {
            sellerOrderId: sellerOrder.id,
            orderId: sellerOrder.orderId,
            sellerId: sellerOrder.sellerId,
            customerId,
            actorType: actor.type,
            reason,
            restocked,
          },
          actorId: actor.userId,
        },
      ]);
      await this.recordChange(sellerOrder, customerId, 'CANCELLED', version, actor.userId);
      return { before: sellerOrder, updated: await this.requireSellerOrder(sellerOrderId) };
    });
    this.cancelled.inc({ actor: actor.type });
    this.logger.log({
      msg: 'seller_order.cancelled',
      sellerOrderId,
      from: result.before.status,
      actor: actor.type,
      reason,
    });
    return SellerOrderDto.from(
      result.updated,
      await this.sellers.findStoreNames([result.updated.sellerId]),
    );
  }

  /** Takes the order lock first, then reads: nothing can change the seller order meanwhile. */
  async lockAndLoad(sellerOrderId: string, ownership: Ownership): Promise<LockedSellerOrder> {
    const locked = await this.orders.lockOrderOf(sellerOrderId);
    if (locked === null) {
      throw new SellerOrderNotFoundError();
    }
    const sellerOrder = await this.requireSellerOrder(sellerOrderId);
    const visible =
      (ownership.customerId === undefined || ownership.customerId === locked.customerId) &&
      (ownership.sellerId === undefined || ownership.sellerId === sellerOrder.sellerId) &&
      (ownership.orderId === undefined || ownership.orderId === sellerOrder.orderId);
    if (!visible) {
      throw new SellerOrderNotFoundError();
    }
    return { sellerOrder, customerId: locked.customerId };
  }

  /** Records `seller_order.status_changed`, and `order.status_changed` when the aggregate moved. */
  async recordChange(
    before: SellerOrderRecord,
    customerId: string,
    to: SellerOrderStatusValue,
    version: number,
    actorId: string | null,
  ): Promise<void> {
    const aggregate = aggregateOrderStatus(await this.orders.statusesOfOrder(before.orderId));
    const orderVersion = await this.orders.applyAggregate(before.orderId, aggregate);
    const payoutCents = to === 'CANCELLED' ? 0 : before.payoutCents;
    await this.outbox.add([
      {
        type: EVENT_TYPE.SELLER_ORDER_STATUS_CHANGED,
        aggregateType: 'SellerOrder',
        aggregateId: before.id,
        payload: {
          sellerOrderId: before.id,
          orderId: before.orderId,
          sellerId: before.sellerId,
          customerId,
          from: before.status,
          to,
          version,
          payoutCents,
          orderStatus: aggregate.status,
          hasCancelledParts: aggregate.hasCancelledParts,
        },
        actorId,
      },
      ...(orderVersion === null
        ? []
        : [
            {
              type: EVENT_TYPE.ORDER_STATUS_CHANGED,
              aggregateType: 'Order',
              aggregateId: before.orderId,
              payload: {
                orderId: before.orderId,
                customerId,
                status: aggregate.status,
                hasCancelledParts: aggregate.hasCancelledParts,
                version: orderVersion,
              },
              actorId,
            },
          ]),
    ]);
  }

  private async requireSellerOrder(id: string): Promise<SellerOrderRecord> {
    const sellerOrder = await this.orders.findSellerOrder(id);
    if (sellerOrder === null) {
      throw new SellerOrderNotFoundError();
    }
    return sellerOrder;
  }
}
