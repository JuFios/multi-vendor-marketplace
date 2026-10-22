import { Injectable, Logger } from '@nestjs/common';

import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import { PaymentsService } from '../payments-ledger/payments.service';

import type { SellerOrderRecord } from './order';
import { OrdersRepository } from './orders.repository';
import {
  type LifecycleOutcome,
  SellerOrderLifecycleService,
} from './seller-order-lifecycle.service';
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
    private readonly payments: PaymentsService,
  ) {}

  /**
   * A seller order that was cancelled while the payment ran gets the money back at once: its
   * books were reversed on cancellation, so only the gateway still has to pay it back.
   */
  async onPaymentCaptured(sellerOrderId: string): Promise<void> {
    const locked = await this.lockAndFind(sellerOrderId);
    if (locked === null) {
      return;
    }
    const { sellerOrder } = locked;
    const cancelled = sellerOrder.status === 'CANCELLED';
    const changed = await this.changePayment(locked, cancelled ? 'REFUNDED' : 'CAPTURED');
    if (cancelled && changed) {
      await this.payments.requestRefund(
        sellerOrder.id,
        sellerOrder.subtotalCents - sellerOrder.refundedCents,
        'LATE_CAPTURE',
      );
    }
  }

  /**
   * Cancels this seller order only; the other sellers of the order keep going. Runs in the
   * caller's transaction and returns the compensation, if any, for `reportCompensation` once
   * that transaction has committed.
   */
  async onPaymentFailed(sellerOrderId: string): Promise<LifecycleOutcome | null> {
    const locked = await this.lockAndFind(sellerOrderId);
    if (locked === null) {
      return null;
    }
    await this.changePayment(locked, 'FAILED');
    if (locked.sellerOrder.status !== 'NEW') {
      return null;
    }
    return this.lifecycle.applyCancellation(
      sellerOrderId,
      PAYMENT_FAILED_REASON,
      { type: 'SYSTEM', userId: null },
      {},
    );
  }

  /** Logs and counts a compensation; only call it after the transaction that made it committed. */
  reportCompensation(outcome: LifecycleOutcome): void {
    this.lifecycle.report(outcome);
    this.logger.warn({ msg: 'saga.compensation.applied', sellerOrderId: outcome.updated.id });
  }

  /**
   * Applies the outcome once; the event lets the live views show the new payment status.
   * Returns whether this call moved the status.
   */
  private async changePayment(
    { sellerOrder, customerId }: LockedSellerOrder,
    to: PaymentStatusValue,
  ): Promise<boolean> {
    const version = await this.orders.changePaymentStatus(sellerOrder.id, 'PENDING', to);
    if (version === null) {
      return false;
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
          version,
        },
        actorId: null,
      },
    ]);
    return true;
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
