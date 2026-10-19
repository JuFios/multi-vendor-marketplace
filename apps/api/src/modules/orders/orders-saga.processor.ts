import { Processor } from '@nestjs/bullmq';

import { IdempotentProcessor } from '../../outbox';
import { type AnyDomainEvent, EVENT_TYPE } from '../../outbox/events';
import { QUEUE } from '../../queue';

import { PaymentSagaService } from './payment-saga.service';

/** Step two of the saga: applies the payment outcome to the seller order. */
@Processor(QUEUE.ORDERS_SAGA)
export class OrdersSagaProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'orders-saga';
  protected readonly queue = QUEUE.ORDERS_SAGA;
  protected readonly eventTypes = [EVENT_TYPE.PAYMENT_CAPTURED, EVENT_TYPE.PAYMENT_FAILED] as const;

  constructor(private readonly saga: PaymentSagaService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    if (event.type === EVENT_TYPE.PAYMENT_CAPTURED) {
      await this.runIdempotent(event.id, () =>
        this.saga.onPaymentCaptured(event.payload.sellerOrderId),
      );
    } else if (event.type === EVENT_TYPE.PAYMENT_FAILED) {
      await this.runIdempotent(event.id, () =>
        this.saga.onPaymentFailed(event.payload.sellerOrderId),
      );
    }
  }
}
