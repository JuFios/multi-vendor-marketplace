import { AppError, NotFoundError } from '../../common/exceptions/app-error';

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
