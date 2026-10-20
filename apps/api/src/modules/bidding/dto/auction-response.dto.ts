import { ApiProperty } from '@nestjs/swagger';

import {
  AUCTION_STATUSES,
  type AuctionRecord,
  type BidRecord,
  maskBidder,
  minNextBidCents,
} from '../auction';

export class AuctionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ format: 'uuid' })
  sellerId: string;

  @ApiProperty({ enum: AUCTION_STATUSES })
  status: string;

  @ApiProperty({ description: 'Starts at 1; a new round begins when the lot is offered again.' })
  round: number;

  @ApiProperty()
  startPriceCents: number;

  @ApiProperty()
  bidStepCents: number;

  @ApiProperty({ type: Number, nullable: true })
  currentPriceCents: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'The lowest bid accepted now; null once the round is over.',
  })
  minNextBidCents: number | null;

  @ApiProperty()
  bidCount: number;

  @ApiProperty({ type: String, nullable: true, description: 'The leading bidder, masked.' })
  leader: string | null;

  @ApiProperty({ format: 'date-time' })
  endsAt: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Until when the winner can check out.',
  })
  winnerDeadlineAt: string | null;

  @ApiProperty({ description: 'Grows with every change; clients drop updates that are older.' })
  version: number;

  @ApiProperty({ format: 'date-time', description: 'The server clock, to correct a client timer.' })
  serverTime: string;

  static from(auction: AuctionRecord): AuctionDto {
    return {
      id: auction.id,
      productId: auction.productId,
      sellerId: auction.sellerId,
      status: auction.status,
      round: auction.round,
      startPriceCents: auction.startPriceCents,
      bidStepCents: auction.bidStepCents,
      currentPriceCents: auction.currentPriceCents,
      minNextBidCents: auction.status === 'ACTIVE' ? minNextBidCents(auction) : null,
      bidCount: auction.bidCount,
      leader:
        auction.highestBidderId === null ? null : maskBidder(auction.highestBidderId, auction.id),
      endsAt: auction.endsAt.toISOString(),
      winnerDeadlineAt: auction.winnerDeadlineAt?.toISOString() ?? null,
      version: auction.version,
      serverTime: auction.dbNow.toISOString(),
    };
  }
}

export class AuctionPageDto {
  @ApiProperty({ type: [AuctionDto] })
  items: AuctionDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class BidDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  round: number;

  @ApiProperty()
  amountCents: number;

  @ApiProperty({ description: 'Masked for other people’s bids; the caller’s own say "You".' })
  bidder: string;

  @ApiProperty({ description: 'True for the caller’s own bids.' })
  isOwn: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(bid: BidRecord, viewerId: string | undefined): BidDto {
    const isOwn = viewerId !== undefined && bid.bidderId === viewerId;
    return {
      id: bid.id,
      round: bid.round,
      amountCents: bid.amountCents,
      bidder: isOwn ? 'You' : maskBidder(bid.bidderId, bid.auctionId),
      isOwn,
      createdAt: bid.createdAt.toISOString(),
    };
  }
}

export class BidPageDto {
  @ApiProperty({ type: [BidDto] })
  items: BidDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
