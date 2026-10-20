import { createHash } from 'node:crypto';

export const AUCTION_STATUSES = ['ACTIVE', 'SOLD_TO_WINNER', 'ORDERED', 'NOT_SOLD'] as const;
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

/** An auction row; `dbNow` is the database clock at the moment the row was read. */
export interface AuctionRecord {
  readonly id: string;
  readonly productId: string;
  readonly sellerId: string;
  readonly startPriceCents: number;
  readonly bidStepCents: number;
  readonly durationSec: number;
  readonly round: number;
  readonly status: AuctionStatus;
  readonly endsAt: Date;
  readonly currentPriceCents: number | null;
  readonly highestBidId: string | null;
  readonly highestBidderId: string | null;
  readonly bidCount: number;
  readonly winnerId: string | null;
  readonly winnerDeadlineAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly dbNow: Date;
}

export interface BidRecord {
  readonly id: string;
  readonly auctionId: string;
  readonly round: number;
  readonly bidderId: string;
  readonly amountCents: number;
  readonly createdAt: Date;
}

/** A round lasts from one minute to thirty days. */
export const AUCTION_MIN_DURATION_SEC = 60;
export const AUCTION_MAX_DURATION_SEC = 30 * 24 * 60 * 60;

export function isAllowedDuration(durationSec: number): boolean {
  return durationSec >= AUCTION_MIN_DURATION_SEC && durationSec <= AUCTION_MAX_DURATION_SEC;
}

type BidFloor = Pick<AuctionRecord, 'currentPriceCents' | 'startPriceCents' | 'bidStepCents'>;

/** The lowest bid that is accepted: the start price first, then the leading bid plus one step. */
export function minNextBidCents(auction: BidFloor): number {
  return auction.currentPriceCents === null
    ? auction.startPriceCents
    : auction.currentPriceCents + auction.bidStepCents;
}

/** How other participants see a bidder (I-21): stable within one auction, not reversible. */
export function maskBidder(bidderId: string, auctionId: string): string {
  const digest = createHash('sha256').update(`${auctionId}:${bidderId}`).digest('hex');
  return `Bidder #${digest.slice(0, 4)}`;
}
