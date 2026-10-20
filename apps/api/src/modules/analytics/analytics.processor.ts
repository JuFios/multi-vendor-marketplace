import { Processor } from '@nestjs/bullmq';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { SalesProjectionService } from './sales-projection.service';

/**
 * Updates the daily sales read models. Each event adds to running totals, so the inbox row and
 * the update share one transaction: a redelivered event is counted once.
 */
@Processor(QUEUE.ANALYTICS)
export class AnalyticsProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'analytics';
  protected readonly queue = QUEUE.ANALYTICS;
  protected readonly eventTypes = [
    EVENT_TYPE.SELLER_ORDER_CREATED,
    EVENT_TYPE.SELLER_ORDER_CANCELLED,
    EVENT_TYPE.REFUND_CREATED,
  ] as const;

  constructor(private readonly projection: SalesProjectionService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    switch (event.type) {
      case EVENT_TYPE.SELLER_ORDER_CREATED:
        await this.runIdempotent(event.id, () =>
          this.projection.onSellerOrderCreated(event.payload.sellerOrderId),
        );
        return;
      case EVENT_TYPE.SELLER_ORDER_CANCELLED:
        await this.runIdempotent(event.id, () =>
          this.projection.onSellerOrderCancelled(event.payload.sellerOrderId),
        );
        return;
      case EVENT_TYPE.REFUND_CREATED:
        await this.runIdempotent(event.id, () =>
          this.projection.onRefundsCreated(event.payload.sellerOrderId, event.payload.refundIds),
        );
        return;
      default:
        return;
    }
  }
}
