import { Processor } from '@nestjs/bullmq';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { SearchIndexer } from './search-indexer.service';

const PRODUCT_EVENT_TYPES = [
  EVENT_TYPE.PRODUCT_CREATED,
  EVENT_TYPE.PRODUCT_UPDATED,
  EVENT_TYPE.PRODUCT_ARCHIVED,
  EVENT_TYPE.PRODUCT_MODERATED,
  EVENT_TYPE.PRODUCT_STOCK_CHANGED,
  EVENT_TYPE.PRODUCT_RATING_CHANGED,
] as const;

/**
 * The only writer of the search index besides the reindex command. Handling an event re-reads
 * the product, so redelivery needs no inbox row.
 */
@Processor(QUEUE.SEARCH_SYNC)
export class SearchSyncProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'search-sync';
  protected readonly queue = QUEUE.SEARCH_SYNC;
  protected readonly eventTypes = [...PRODUCT_EVENT_TYPES, EVENT_TYPE.CATEGORY_UPDATED] as const;

  constructor(private readonly indexer: SearchIndexer) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    if (event.type === EVENT_TYPE.CATEGORY_UPDATED) {
      await this.indexer.syncCategory(event.payload.categoryId);
      return;
    }
    // Every other event this processor takes carries the id of the product it concerns.
    await this.indexer.syncProducts([(event.payload as { productId: string }).productId]);
  }
}
