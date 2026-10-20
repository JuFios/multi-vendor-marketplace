import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';

import { type AuctionRecord, isAllowedDuration } from './auction';
import { AuctionsRepository } from './auctions.repository';
import { AuctionEndsAtOutOfRangeError, AuctionNotFoundError } from './bidding.errors';
import { AuctionDto, AuctionPageDto, BidDto, BidPageDto } from './dto/auction-response.dto';
import type { ListBidsQueryDto } from './dto/list-bids-query.dto';

export interface NewLot {
  readonly productId: string;
  readonly sellerId: string;
  readonly startPriceCents: number;
  readonly bidStepCents: number;
  readonly endsAt: Date;
}

/** What other modules and the auction routes may do with auctions. */
@Injectable()
export class AuctionsService {
  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly auctions: AuctionsRepository,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Opens the first round for a product the caller has just created, in the caller's
   * transaction. The round's length is fixed now, on the database clock, and reused by every
   * later round of the lot.
   */
  async createForProduct(lot: NewLot): Promise<AuctionRecord> {
    if (!this.txHost.isTransactionActive()) {
      throw new Error('An auction can only be created inside a transaction');
    }
    const durationSec = await this.auctions.secondsUntil(lot.endsAt);
    if (!isAllowedDuration(durationSec)) {
      throw new AuctionEndsAtOutOfRangeError();
    }
    const auction = await this.auctions.insert({ ...lot, durationSec });
    await this.outbox.add([
      {
        type: EVENT_TYPE.AUCTION_STARTED,
        aggregateType: 'Auction',
        aggregateId: auction.id,
        payload: {
          auctionId: auction.id,
          productId: auction.productId,
          round: auction.round,
          endsAt: auction.endsAt.toISOString(),
        },
      },
    ]);
    return auction;
  }

  async findById(id: string): Promise<AuctionRecord> {
    const auction = await this.auctions.findById(id);
    if (auction === null) {
      throw new AuctionNotFoundError();
    }
    return auction;
  }

  /** The current state of the auction, straight from the database (clients resync with it). */
  async getSnapshot(id: string): Promise<AuctionDto> {
    return AuctionDto.from(await this.findById(id));
  }

  /** The bids of a round, bidders masked (I-21) except the viewer's own. */
  async listBids(
    id: string,
    viewerId: string | undefined,
    query: ListBidsQueryDto,
  ): Promise<BidPageDto> {
    const auction = await this.findById(id);
    const { items, total } = await this.auctions.listBids(
      id,
      query.round ?? auction.round,
      query.page,
      query.limit,
    );
    return {
      items: items.map((bid) => BidDto.from(bid, viewerId)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async listOfSeller(sellerId: string, page: number, limit: number): Promise<AuctionPageDto> {
    const { items, total } = await this.auctions.listOfSeller(sellerId, page, limit);
    return { items: items.map((auction) => AuctionDto.from(auction)), total, page, limit };
  }
}
