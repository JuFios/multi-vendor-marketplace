import { AppError, ConflictError, NotFoundError } from '../../common/exceptions/app-error';

import { AUCTION_MAX_DURATION_SEC, AUCTION_MIN_DURATION_SEC } from './auction';

export class AuctionNotFoundError extends NotFoundError {
  constructor() {
    super('Auction not found', 'AUCTION_NOT_FOUND');
  }
}

export class AuctionEndsAtOutOfRangeError extends AppError {
  constructor() {
    super(
      'AUCTION_ENDS_AT_OUT_OF_RANGE',
      422,
      'An auction must end between one minute and thirty days from now',
      { minSeconds: AUCTION_MIN_DURATION_SEC, maxSeconds: AUCTION_MAX_DURATION_SEC },
    );
  }
}

export type BidRejection =
  'BID_TOO_LOW' | 'AUCTION_NOT_ACTIVE' | 'AUCTION_ENDED' | 'SELF_BID_FORBIDDEN';

/** A bid the rules refuse; the buyer learns the lowest amount that would be accepted now. */
export class BidRejectedError extends AppError {
  constructor(code: BidRejection, minNextBidCents: number | null) {
    super(code, 422, BID_REJECTION_MESSAGES[code], { minNextBidCents });
  }
}

const BID_REJECTION_MESSAGES: Readonly<Record<BidRejection, string>> = {
  BID_TOO_LOW: 'The bid is lower than the minimum next bid',
  AUCTION_NOT_ACTIVE: 'The auction is not accepting bids',
  AUCTION_ENDED: 'The auction has ended',
  SELF_BID_FORBIDDEN: 'You cannot bid on your own lot',
};

export class BidConflictError extends ConflictError {
  constructor() {
    super('Other bids kept changing the auction; read its state and try again', 'BID_CONFLICT');
  }
}
