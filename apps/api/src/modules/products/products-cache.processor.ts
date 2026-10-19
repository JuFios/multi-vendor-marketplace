import { Processor } from '@nestjs/bullmq';

import { IdempotentProcessor } from '../../outbox';
import { type AnyDomainEvent, EVENT_TYPE, type EventType } from '../../outbox/events';
import { QUEUE } from '../../queue';

import { ProductDetailsCache } from './product-details-cache.service';

// Every one of these payloads carries a `productId`.
const PRODUCT_EVENT_TYPES = [
  EVENT_TYPE.PRODUCT_UPDATED,
  EVENT_TYPE.PRODUCT_ARCHIVED,
  EVENT_TYPE.PRODUCT_MODERATED,
  EVENT_TYPE.PRODUCT_STOCK_CHANGED,
  EVENT_TYPE.PRODUCT_RATING_CHANGED,
] as const satisfies readonly EventType[];

/**
 * Drops the cached product page again after the change committed. It closes the race where a
 * reader stored the old page between the commit and the request's own delete. A delete needs no
 * inbox: repeating it is harmless, and a failure makes the queue retry.
 */
@Processor(QUEUE.CACHE)
export class ProductsCacheProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'products-cache';
  protected readonly queue = QUEUE.CACHE;
  protected readonly eventTypes = PRODUCT_EVENT_TYPES;

  constructor(private readonly detailsCache: ProductDetailsCache) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    await this.detailsCache.invalidateOrThrow((event.payload as { productId: string }).productId);
  }
}
