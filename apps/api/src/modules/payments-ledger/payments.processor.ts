import { Processor } from '@nestjs/bullmq';

import { IdempotentProcessor } from '../../outbox';
import { type AnyDomainEvent, EVENT_TYPE } from '../../outbox/events';
import { QUEUE } from '../../queue';

import { PaymentsService } from './payments.service';

/** Step one of the saga: charges every new seller order on its own. */
@Processor(QUEUE.PAYMENTS)
export class PaymentsProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'payments';
  protected readonly queue = QUEUE.PAYMENTS;
  protected readonly eventTypes = [EVENT_TYPE.SELLER_ORDER_CREATED] as const;

  constructor(private readonly payments: PaymentsService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    if (event.type !== EVENT_TYPE.SELLER_ORDER_CREATED) {
      return;
    }
    const { sellerOrderId, amountCents } = event.payload;
    await this.runIdempotent(event.id, () => this.payments.charge(sellerOrderId, amountCents));
  }
}
