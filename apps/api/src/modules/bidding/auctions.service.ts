import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';

import { type AuctionRecord, isAllowedDuration, type LotListing, lotListingOf } from './auction';
import { AuctionsRepository } from './auctions.repository';
import {
  AuctionEndsAtOutOfRangeError,
  AuctionNotFoundError,
  AuctionWindowExpiredError,
  ProductHasActiveAuctionError,
} from './bidding.errors';
import { AuctionDto, AuctionPageDto, BidDto, BidPageDto } from './dto/auction-response.dto';
import type { ListBidsQueryDto } from './dto/list-bids-query.dto';

export interface NewLot {
  readonly productId: string;
  readonly sellerId: string;
  readonly startPriceCents: number;
  readonly bidStepCents: number;
  readonly endsAt: Date;
  /**
   * Whether the product is in the public catalog right away. A lot that waits for its approval
   * starts PENDING: it takes no bids and its clock starts when the product is approved.
   */
  readonly published: boolean;
}

/** A lot handed to an order: the price is the winning bid. */
export interface SettledLot {
  readonly auctionId: string;
  readonly productId: string;
  readonly sellerId: string;
  readonly priceCents: number;
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
    const { published, ...fields } = lot;
    const auction = await this.auctions.insert({
      ...fields,
      durationSec,
      status: published ? 'ACTIVE' : 'PENDING',
    });
    if (published) {
      await this.outbox.add([startedEvent(auction)]);
    }
    return auction;
  }

  /** Locks the product's lot, if it has one, for the rest of the caller's transaction. */
  async lockLot(productId: string): Promise<void> {
    await this.auctions.lockByProductId(productId);
  }

  /**
   * Follows the moderation of the lot's product, in the caller's transaction. An approval starts
   * the clock of a lot that waited for it. A rejection ends the lot as not sold, bids or not: a
   * product the catalog no longer shows must not keep taking bids or go to a winner. A lot that
   * is already part of an order is left to that order.
   */
  async onProductModerated(productId: string, approved: boolean): Promise<void> {
    const auction = await this.auctions.lockByProductId(productId);
    if (auction === null) {
      return;
    }
    if (approved) {
      const started = await this.auctions.activateIfPending(auction.id);
      if (started !== null) {
        await this.outbox.add([startedEvent(started)]);
      }
      return;
    }
    if (await this.auctions.markNotSold(auction.id)) {
      await this.outbox.add([closedAsNotSoldEvent(auction, 'MODERATION')]);
    }
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

  /** The store's auctions that are still taking bids, the ones ending first up front. */
  listActiveOfSeller(sellerId: string, limit: number): Promise<AuctionRecord[]> {
    return this.auctions.listActiveOfSeller(sellerId, limit);
  }

  /** The auctions of the given products, each read together with the database clock. */
  findByProductIds(productIds: readonly string[]): Promise<AuctionRecord[]> {
    return this.auctions.findByProductIds(productIds);
  }

  /** How the catalog shows each of the given lots, by product id. */
  async findListings(productIds: readonly string[]): Promise<Map<string, LotListing>> {
    const auctions = await this.auctions.findByProductIds(productIds);
    return new Map(auctions.map((auction) => [auction.productId, lotListingOf(auction)]));
  }

  /**
   * Checkout takes the won lots: each goes SOLD_TO_WINNER to ORDERED for this buyer. If the
   * window ran out or the lot is not the buyer's, the caller's transaction fails as a whole.
   */
  async settleWonLots(userId: string, productIds: readonly string[]): Promise<SettledLot[]> {
    if (!this.txHost.isTransactionActive()) {
      throw new Error('Auction lots can only be settled inside a transaction');
    }
    const settled: SettledLot[] = [];
    for (const productId of [...productIds].sort()) {
      const auction = await this.auctions.settleWonLot(productId, userId);
      const priceCents = auction?.currentPriceCents ?? null;
      if (auction === null || priceCents === null) {
        throw new AuctionWindowExpiredError();
      }
      settled.push({
        auctionId: auction.id,
        productId,
        sellerId: auction.sellerId,
        priceCents,
      });
    }
    return settled;
  }

  /**
   * Called when a product with an auction is archived (I-16), in the caller's transaction. A
   * lot with bids, or a winner who has not checked out yet, cannot go; one without bids is
   * simply not sold, and closes like any other round so its timer and live views follow.
   */
  async prepareForArchive(productId: string): Promise<void> {
    const auction = await this.auctions.lockByProductId(productId);
    if (auction === null) {
      return;
    }
    if (
      auction.status === 'SOLD_TO_WINNER' ||
      (auction.status === 'ACTIVE' && auction.bidCount > 0)
    ) {
      throw new ProductHasActiveAuctionError();
    }
    if (auction.status === 'ACTIVE' || auction.status === 'PENDING') {
      await this.auctions.markNotSold(auction.id);
      await this.outbox.add([closedAsNotSoldEvent(auction, 'ARCHIVE')]);
    }
  }
}

function startedEvent(auction: AuctionRecord) {
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
  } as const;
}

function closedAsNotSoldEvent(auction: AuctionRecord, closedBy: 'ARCHIVE' | 'MODERATION') {
  return {
    type: EVENT_TYPE.AUCTION_CLOSED,
    aggregateType: 'Auction',
    aggregateId: auction.id,
    payload: {
      auctionId: auction.id,
      productId: auction.productId,
      sellerId: auction.sellerId,
      round: auction.round,
      outcome: 'NOT_SOLD',
      closedBy,
    },
  } as const;
}
