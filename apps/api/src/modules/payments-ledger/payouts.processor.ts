import { Processor } from '@nestjs/bullmq';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { PayoutsService } from './payouts.service';

/** Pays the seller once their seller order is completed. */
@Processor(QUEUE.PAYOUTS)
export class PayoutsProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'payouts';
  protected readonly queue = QUEUE.PAYOUTS;
  protected readonly eventTypes = [EVENT_TYPE.SELLER_ORDER_STATUS_CHANGED] as const;

  constructor(private readonly payouts: PayoutsService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    if (event.type !== EVENT_TYPE.SELLER_ORDER_STATUS_CHANGED || event.payload.to !== 'COMPLETED') {
      return;
    }
    const { sellerOrderId, sellerId } = event.payload;
    await this.runIdempotent(event.id, () => this.payouts.payOut(sellerOrderId, sellerId));
  }
}
