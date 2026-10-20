import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { biddingConfig } from '../../config/bidding.config';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import {
  BID_OPTIMISTIC_RETRIES_TOTAL,
  BIDS_PLACED_TOTAL,
  BIDS_REJECTED_TOTAL,
} from '../../metrics/metrics.constants';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import { SellersService } from '../sellers/sellers.service';

import { AuctionsRepository } from './auctions.repository';
import { AuctionsService } from './auctions.service';
import { validateBid } from './bid';
import { BidConflictError, BidRejectedError } from './bidding.errors';
import { AuctionDto, BidDto } from './dto/auction-response.dto';
import type { PlacedBidDto } from './dto/place-bid.dto';

@Injectable()
export class BidsService {
  private readonly logger = new Logger(BidsService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    @Inject(biddingConfig.KEY) private readonly settings: ConfigType<typeof biddingConfig>,
    @InjectMetric(BIDS_PLACED_TOTAL) private readonly placed: Counter,
    @InjectMetric(BIDS_REJECTED_TOTAL) private readonly rejected: Counter<'reason'>,
    @InjectMetric(BID_OPTIMISTIC_RETRIES_TOTAL) private readonly retries: Counter,
    private readonly auctions: AuctionsRepository,
    private readonly auctionsService: AuctionsService,
    private readonly sellers: SellersService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Optimistic locking: read the auction, check the rules, then try to write the bid together
   * with a version-checked update of the auction. If another bid changed the auction in
   * between, the write finds nothing to update, nothing is stored and the whole attempt
   * starts over on the new state, up to `BID_MAX_RETRIES` times.
   */
  async placeBid(auctionId: string, bidderId: string, amountCents: number): Promise<PlacedBidDto> {
    let sellerUserId: string | undefined;
    for (let attempt = 1; attempt <= this.settings.maxRetries; attempt += 1) {
      const auction = await this.auctionsService.findById(auctionId);
      sellerUserId ??= await this.sellers.findOwnerId(auction.sellerId);
      const verdict = validateBid({
        auction,
        amountCents,
        bidderId,
        sellerUserId,
        now: auction.dbNow,
      });
      if (!verdict.ok) {
        this.rejected.inc({ reason: verdict.code });
        this.logger.warn({
          msg: 'bid.rejected',
          auctionId,
          bidderId,
          amountCents,
          reason: verdict.code,
        });
        throw new BidRejectedError(verdict.code, verdict.minNextBidCents);
      }
      const result = await this.txHost.withTransaction(async () => {
        const written = await this.auctions.placeBid(
          auctionId,
          auction.version,
          bidderId,
          amountCents,
        );
        if (written === null) {
          return null;
        }
        await this.outbox.add([
          {
            type: EVENT_TYPE.AUCTION_BID_PLACED,
            aggregateType: 'Auction',
            aggregateId: auctionId,
            payload: {
              auctionId,
              productId: written.auction.productId,
              round: written.auction.round,
              currentPriceCents: amountCents,
              bidCount: written.auction.bidCount,
              version: written.auction.version,
              endsAt: written.auction.endsAt.toISOString(),
            },
          },
        ]);
        const response = {
          bid: BidDto.from(written.bid, bidderId),
          auction: AuctionDto.from(written.auction),
        };
        await this.idempotency.complete(response);
        return response;
      });
      if (result === null) {
        this.retries.inc();
        continue;
      }
      this.placed.inc();
      this.logger.log({
        msg: 'bid.placed',
        auctionId,
        bidId: result.bid.id,
        bidderId,
        amountCents,
        bidCount: result.auction.bidCount,
        attempt,
      });
      return result;
    }
    this.rejected.inc({ reason: 'BID_CONFLICT' });
    this.logger.warn({
      msg: 'bid.rejected',
      auctionId,
      bidderId,
      amountCents,
      reason: 'BID_CONFLICT',
    });
    throw new BidConflictError();
  }
}
