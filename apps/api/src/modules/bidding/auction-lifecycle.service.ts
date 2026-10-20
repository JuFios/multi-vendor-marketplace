import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';

import { biddingConfig } from '../../config/bidding.config';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';

import type { AuctionRecord } from './auction';
import { AuctionsRepository } from './auctions.repository';

/** How many due auctions one sweep handles; the next sweep takes the rest. */
const SWEEP_BATCH = 100;

/**
 * The moves of an auction that nobody asks for: ending a round at its deadline and offering
 * the lot again when the winner does not check out. Each move is one conditional UPDATE plus
 * its events, so it can be repeated or raced by a bid or a checkout without harm.
 */
@Injectable()
export class AuctionLifecycleService {
  private readonly logger = new Logger(AuctionLifecycleService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    @Inject(biddingConfig.KEY) private readonly settings: ConfigType<typeof biddingConfig>,
    private readonly auctions: AuctionsRepository,
    private readonly outbox: OutboxService,
  ) {}

  /** Closes the auction if its deadline has passed; true when this call did it. */
  async closeIfDue(auctionId: string): Promise<boolean> {
    const closed = await this.txHost.withTransaction(async () => {
      const auction = await this.auctions.closeIfDue(auctionId, this.settings.winnerWindowMin);
      if (auction === null) {
        return null;
      }
      await this.outbox.add([
        {
          type: EVENT_TYPE.AUCTION_CLOSED,
          aggregateType: 'Auction',
          aggregateId: auction.id,
          payload: {
            auctionId: auction.id,
            productId: auction.productId,
            sellerId: auction.sellerId,
            round: auction.round,
            outcome: auction.status === 'SOLD_TO_WINNER' ? 'SOLD_TO_WINNER' : 'NOT_SOLD',
            ...(auction.winnerId === null ? {} : { winnerId: auction.winnerId }),
            ...(auction.currentPriceCents === null || auction.winnerId === null
              ? {}
              : { priceCents: auction.currentPriceCents }),
            ...(auction.winnerDeadlineAt === null
              ? {}
              : { winnerDeadlineAt: auction.winnerDeadlineAt.toISOString() }),
          },
          actorId: null,
        },
      ]);
      return auction;
    });
    if (closed === null) {
      return false;
    }
    this.logger.log({
      msg: 'auction.closed',
      auctionId,
      round: closed.round,
      outcome: closed.status,
      bidCount: closed.bidCount,
    });
    return true;
  }

  /** Starts a new round if the winner's window ran out; true when this call did it. */
  async expireIfDue(auctionId: string): Promise<boolean> {
    const expired = await this.txHost.withTransaction(async () => {
      const result = await this.auctions.expireIfDue(auctionId);
      if (result === null) {
        return null;
      }
      await this.outbox.add([
        {
          type: EVENT_TYPE.AUCTION_WINNER_EXPIRED,
          aggregateType: 'Auction',
          aggregateId: auctionId,
          payload: {
            auctionId,
            productId: result.auction.productId,
            sellerId: result.auction.sellerId,
            previousWinnerId: result.previousWinnerId,
            newRound: result.auction.round,
          },
          actorId: null,
        },
        this.startedEvent(result.auction),
      ]);
      return result.auction;
    });
    if (expired === null) {
      return false;
    }
    this.logger.log({ msg: 'auction.winner_expired', auctionId, newRound: expired.round });
    return true;
  }

  /**
   * The order that took the lot was cancelled: offer it again as a new round (I-03). Part of
   * the caller's transaction; false when the auction is not ORDERED.
   */
  async restartIfOrdered(auctionId: string): Promise<boolean> {
    const auction = await this.auctions.restartIfOrdered(auctionId);
    if (auction === null) {
      return false;
    }
    await this.outbox.add([this.startedEvent(auction)]);
    this.logger.log({ msg: 'auction.restarted', auctionId, round: auction.round });
    return true;
  }

  /** The timers' backstop: handles whatever is due, whether or not its timer ever fired. */
  async sweep(): Promise<{ closed: number; expired: number }> {
    const due = await this.auctions.findDue(SWEEP_BATCH);
    let closed = 0;
    let expired = 0;
    for (const { id, status } of due) {
      if (status === 'ACTIVE') {
        closed += (await this.closeIfDue(id)) ? 1 : 0;
      } else {
        expired += (await this.expireIfDue(id)) ? 1 : 0;
      }
    }
    return { closed, expired };
  }

  private startedEvent(auction: AuctionRecord) {
    return {
      type: EVENT_TYPE.AUCTION_STARTED,
      aggregateType: 'Auction',
      aggregateId: auction.id,
      payload: {
        auctionId: auction.id,
        productId: auction.productId,
        round: auction.round,
        endsAt: auction.endsAt.toISOString(),
      },
      actorId: null,
    } as const;
  }
}
