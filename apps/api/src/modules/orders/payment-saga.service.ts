import { Injectable, Logger } from '@nestjs/common';

import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';

import type { SellerOrderRecord } from './order';
import { OrdersRepository } from './orders.repository';
import { SellerOrderLifecycleService } from './seller-order-lifecycle.service';
import type { PaymentStatusValue } from './seller-order-state-machine';

export const PAYMENT_FAILED_REASON = 'PAYMENT_FAILED';

interface LockedSellerOrder {
  readonly sellerOrder: SellerOrderRecord;
  readonly customerId: string;
}

/**
 * Follows the payment of each seller order separately. Everything runs under the order lock,
 * so it cannot interleave with a seller or customer changing the same seller order.
 */
@Injectable()
export class PaymentSagaService {
  private readonly logger = new Logger(PaymentSagaService.name);

  constructor(
    private readonly orders: OrdersRepository,
    private readonly lifecycle: SellerOrderLifecycleService,
    private readonly outbox: OutboxService,
  ) {}

  /** A seller order that was cancelled while the payment ran gets the money back at once. */
  async onPaymentCaptured(sellerOrderId: string): Promise<void> {
    const locked = await this.lockAndFind(sellerOrderId);
    if (locked === null) {
      return;
    }
    const to = locked.sellerOrder.status === 'CANCELLED' ? 'REFUNDED' : 'CAPTURED';
    await this.changePayment(locked, to);
  }

  /** Cancels this seller order only; the other sellers of the order keep going. */
  async onPaymentFailed(sellerOrderId: string): Promise<void> {
    const locked = await this.lockAndFind(sellerOrderId);
    if (locked === null) {
      return;
    }
    await this.changePayment(locked, 'FAILED');
    if (locked.sellerOrder.status === 'NEW') {
      await this.lifecycle.cancel(
        sellerOrderId,
        PAYMENT_FAILED_REASON,
        { type: 'SYSTEM', userId: null },
        {},
      );
      this.logger.warn({ msg: 'saga.compensation.applied', sellerOrderId });
    }
  }

  /** Applies the outcome once; the event lets the live views show the new payment status. */
  private async changePayment(
    { sellerOrder, customerId }: LockedSellerOrder,
    to: PaymentStatusValue,
  ): Promise<void> {
    if (!(await this.orders.changePaymentStatus(sellerOrder.id, 'PENDING', to))) {
      return;
    }
    await this.outbox.add([
      {
        type: EVENT_TYPE.SELLER_ORDER_PAYMENT_CHANGED,
        aggregateType: 'SellerOrder',
        aggregateId: sellerOrder.id,
        payload: {
          sellerOrderId: sellerOrder.id,
          orderId: sellerOrder.orderId,
          sellerId: sellerOrder.sellerId,
          customerId,
          paymentStatus: to,
          version: sellerOrder.version + 1,
        },
        actorId: null,
      },
    ]);
  }

  private async lockAndFind(sellerOrderId: string): Promise<LockedSellerOrder | null> {
    const locked = await this.orders.lockOrderOf(sellerOrderId);
    if (locked === null) {
      return null;
    }
    const sellerOrder = await this.orders.findSellerOrder(sellerOrderId);
    return sellerOrder === null ? null : { sellerOrder, customerId: locked.customerId };
  }
}
