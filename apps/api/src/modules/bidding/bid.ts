import { type AuctionRecord, minNextBidCents } from './auction';
import type { BidRejection } from './bidding.errors';

export interface BidAttempt {
  readonly auction: Pick<
    AuctionRecord,
    'status' | 'endsAt' | 'currentPriceCents' | 'startPriceCents' | 'bidStepCents'
  >;
  readonly amountCents: number;
  readonly bidderId: string;
  /** The user who owns the store selling the lot. */
  readonly sellerUserId: string | undefined;
  /** The database clock: deadlines are never judged by the application's. */
  readonly now: Date;
}

export type BidVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: BidRejection; readonly minNextBidCents: number | null };

/**
 * Whether the bid may be placed. A bid of exactly the minimum next amount is accepted; the
 * database still has the last word, because the auction can change between this check and the
 * write.
 */
export function validateBid(attempt: BidAttempt): BidVerdict {
  const { auction, amountCents, bidderId, sellerUserId, now } = attempt;
  const active = auction.status === 'ACTIVE';
  const minNext = active ? minNextBidCents(auction) : null;
  if (sellerUserId !== undefined && bidderId === sellerUserId) {
    return { ok: false, code: 'SELF_BID_FORBIDDEN', minNextBidCents: minNext };
  }
  if (!active) {
    return { ok: false, code: 'AUCTION_NOT_ACTIVE', minNextBidCents: null };
  }
  if (now.getTime() >= auction.endsAt.getTime()) {
    return { ok: false, code: 'AUCTION_ENDED', minNextBidCents: null };
  }
  if (amountCents < minNextBidCents(auction)) {
    return { ok: false, code: 'BID_TOO_LOW', minNextBidCents: minNextBidCents(auction) };
  }
  return { ok: true };
}
