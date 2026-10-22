import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { IdempotencyService } from '../../idempotency/idempotency.service';
import { REFUNDS_TOTAL } from '../../metrics/metrics.constants';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import { LedgerService } from '../payments-ledger/ledger.service';
import { InventoryService } from '../products/inventory.service';
import { SellersService } from '../sellers/sellers.service';

import { SellerOrderDto } from './dto/order-response.dto';
import { RefundResultDto } from './dto/refund.dto';
import { SellerOrderNotFoundError } from './orders.errors';
import { OrdersRepository } from './orders.repository';
import { assertRefundable, planRefund, planRefundRestock, type RefundRequestLine } from './refund';
import { type Ownership, SellerOrderLifecycleService } from './seller-order-lifecycle.service';

export interface RefundActor {
  readonly type: 'SELLER' | 'ADMIN';
  readonly userId: string;
}

export interface RefundInput {
  readonly items: readonly RefundRequestLine[];
  readonly reason: string;
  /** Set when an admin's dispute decision orders the refund. */
  readonly disputeId?: string;
}

/**
 * Partial refunds on the level of single items. The stock of units that have not shipped yet
 * goes back on sale with the refund; shipped units are money only.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    @InjectMetric(REFUNDS_TOTAL) private readonly refunds: Counter,
    private readonly orders: OrdersRepository,
    private readonly lifecycle: SellerOrderLifecycleService,
    private readonly sellers: SellersService,
    private readonly ledger: LedgerService,
    private readonly inventory: InventoryService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * The refund route: the refund, its books, the events and the recorded idempotent response
   * commit together, so a retry with the same key can never refund twice.
   */
  async refund(
    sellerOrderId: string,
    input: RefundInput,
    actor: RefundActor,
    ownership: Ownership,
  ): Promise<RefundResultDto> {
    const result = await this.txHost.withTransaction(async () => {
      const applied = await this.applyRefund(sellerOrderId, input, actor, ownership);
      await this.idempotency.complete(applied);
      return applied;
    });
    this.report(sellerOrderId, result, actor);
    return result;
  }

  /** Counts and logs a refund; only call it after the transaction that made it has committed. */
  report(sellerOrderId: string, result: RefundResultDto, actor: RefundActor): void {
    this.refunds.inc();
    this.logger.log({
      msg: 'refund.created',
      sellerOrderId,
      refundIds: result.refunds.map((refund) => refund.id),
      amountCents: result.amountCents,
      actor: actor.type,
    });
  }

  /**
   * Refunds inside the caller's transaction, for flows with a response of their own (an
   * admin resolving a dispute), which then call `report` after the commit. Takes the order lock first, so two refunds of the last unit
   * run one after another and the second one sees what is left.
   */
  async applyRefund(
    sellerOrderId: string,
    input: RefundInput,
    actor: RefundActor,
    ownership: Ownership,
  ): Promise<RefundResultDto> {
    const { sellerOrder, customerId } = await this.lifecycle.lockAndLoad(sellerOrderId, ownership);
    assertRefundable(sellerOrder);
    const plan = planRefund(sellerOrder, input.items);

    const refunds = await this.orders.applyRefund(sellerOrder.id, plan, {
      reason: input.reason,
      actor,
      ...(input.disputeId === undefined ? {} : { disputeId: input.disputeId }),
    });
    await this.inventory.restock(
      planRefundRestock(sellerOrder.status, sellerOrder.items, plan.lines),
    );
    await this.ledger.recordRefund({
      sellerOrderId: sellerOrder.id,
      sellerId: sellerOrder.sellerId,
      refunds: refunds.map((refund) => ({ refundId: refund.id, amountCents: refund.amountCents })),
      commissionReversalCents: plan.commissionReversalCents,
    });
    await this.orders.bookRefundedOnOrder(sellerOrder.orderId, plan.amountCents);
    await this.outbox.add([
      {
        type: EVENT_TYPE.REFUND_CREATED,
        aggregateType: 'SellerOrder',
        aggregateId: sellerOrder.id,
        payload: {
          refundIds: refunds.map((refund) => refund.id),
          sellerOrderId: sellerOrder.id,
          orderId: sellerOrder.orderId,
          sellerId: sellerOrder.sellerId,
          customerId,
          amountCents: plan.amountCents,
        },
        actorId: actor.userId,
      },
    ]);

    const updated = await this.orders.findSellerOrder(sellerOrder.id);
    if (updated === null) {
      throw new SellerOrderNotFoundError();
    }
    return {
      amountCents: plan.amountCents,
      refunds: refunds.map((refund) => ({ ...refund })),
      sellerOrder: SellerOrderDto.from(
        updated,
        await this.sellers.findStoreNames([updated.sellerId]),
      ),
    };
  }
}
