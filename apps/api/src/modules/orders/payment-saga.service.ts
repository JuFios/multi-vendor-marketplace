import { Injectable, Logger } from '@nestjs/common';

import { OrdersRepository } from './orders.repository';
import { SellerOrderLifecycleService } from './seller-order-lifecycle.service';

export const PAYMENT_FAILED_REASON = 'PAYMENT_FAILED';

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
  ) {}

  /** A seller order that was cancelled while the payment ran gets the money back at once. */
  async onPaymentCaptured(sellerOrderId: string): Promise<void> {
    const sellerOrder = await this.lockAndFind(sellerOrderId);
    if (sellerOrder === null) {
      return;
    }
    const to = sellerOrder.status === 'CANCELLED' ? 'REFUNDED' : 'CAPTURED';
    await this.orders.changePaymentStatus(sellerOrderId, 'PENDING', to);
  }

  /** Cancels this seller order only; the other sellers of the order keep going. */
  async onPaymentFailed(sellerOrderId: string): Promise<void> {
    const sellerOrder = await this.lockAndFind(sellerOrderId);
    if (sellerOrder === null) {
      return;
    }
    await this.orders.changePaymentStatus(sellerOrderId, 'PENDING', 'FAILED');
    if (sellerOrder.status === 'NEW') {
      await this.lifecycle.cancel(
        sellerOrderId,
        PAYMENT_FAILED_REASON,
        { type: 'SYSTEM', userId: null },
        {},
      );
      this.logger.warn({ msg: 'saga.compensation.applied', sellerOrderId });
    }
  }

  private async lockAndFind(sellerOrderId: string) {
    if ((await this.orders.lockOrderOf(sellerOrderId)) === null) {
      return null;
    }
    return this.orders.findSellerOrder(sellerOrderId);
  }
}
