import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { CartService } from './cart.service';

/**
 * Puts a won auction lot into the winner's cart (I-04). An event that arrives late, after the lot
 * was ordered or its checkout window ran out, has nothing left to do: it is consumed, not retried.
 */
@Processor(QUEUE.CART)
export class CartProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'cart';
  protected readonly queue = QUEUE.CART;
  protected readonly eventTypes = [EVENT_TYPE.AUCTION_CLOSED] as const;

  private readonly lotLogger = new Logger('WonLots');

  constructor(private readonly cart: CartService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    if (event.type !== EVENT_TYPE.AUCTION_CLOSED || event.payload.winnerId === undefined) {
      return;
    }
    const { auctionId, winnerId, productId } = event.payload;
    let added = true;
    const ran = await this.runIdempotent(event.id, async () => {
      added = await this.cart.addLotIfWon(winnerId, productId);
    });
    if (ran && !added) {
      this.lotLogger.log({ msg: 'cart.won_lot_skipped', auctionId, userId: winnerId, productId });
    }
  }
}
