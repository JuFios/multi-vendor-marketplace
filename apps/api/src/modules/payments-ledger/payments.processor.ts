import { Processor } from '@nestjs/bullmq';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { PaymentsService } from './payments.service';

/** Step one of the saga: charges every new seller order on its own, and pays refunds back. */
@Processor(QUEUE.PAYMENTS)
export class PaymentsProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'payments';
  protected readonly queue = QUEUE.PAYMENTS;
  protected readonly eventTypes = [
    EVENT_TYPE.SELLER_ORDER_CREATED,
    EVENT_TYPE.PAYMENT_REFUND_REQUESTED,
  ] as const;

  constructor(private readonly payments: PaymentsService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    if (event.type === EVENT_TYPE.SELLER_ORDER_CREATED) {
      const { sellerOrderId, amountCents } = event.payload;
      const result = await this.payments.capture(sellerOrderId, amountCents);
      await this.runIdempotent(event.id, () =>
        this.payments.record(sellerOrderId, amountCents, result),
      );
    } else if (event.type === EVENT_TYPE.PAYMENT_REFUND_REQUESTED) {
      if (await this.payments.isRefundRecorded(event.id)) {
        return;
      }
      const { sellerOrderId, amountCents } = event.payload;
      const result = await this.payments.refund(sellerOrderId, event.id, amountCents);
      await this.runIdempotent(event.id, () =>
        this.payments.recordRefund(sellerOrderId, event.id, amountCents, result),
      );
    }
  }
}
