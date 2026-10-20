import { Processor } from '@nestjs/bullmq';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { CartService } from './cart.service';

/** Puts a won auction lot into the winner's cart (I-04). */
@Processor(QUEUE.CART)
export class CartProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'cart';
  protected readonly queue = QUEUE.CART;
  protected readonly eventTypes = [EVENT_TYPE.AUCTION_CLOSED] as const;

  constructor(private readonly cart: CartService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    if (event.type !== EVENT_TYPE.AUCTION_CLOSED || event.payload.winnerId === undefined) {
      return;
    }
    const { winnerId, productId } = event.payload;
    await this.runIdempotent(event.id, () => this.cart.addWonLot(winnerId, productId));
  }
}
