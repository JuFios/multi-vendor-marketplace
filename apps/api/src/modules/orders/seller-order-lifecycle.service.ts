import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { OutboxService } from '../../outbox';
import { EVENT_TYPE } from '../../outbox/events';
import type { AppTransactionHost } from '../../prisma';
import { SellersService } from '../sellers';

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
    private readonly orders: OrdersRepository,
    private readonly sellers: SellersService,
    private readonly outbox: OutboxService,
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
