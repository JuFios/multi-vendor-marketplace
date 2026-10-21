import { errorMessage } from '../../lib/api/error-message';
import { isApiError } from '../../lib/api/errors';
import { formatMoney } from '../../lib/money';

export interface BidFailure {
  message: string;
  /** The auction moved on, so the shown state must be re-read. */
  refresh: boolean;
  /** The server gave a final answer, so a new attempt is a new action with a new key. */
  definitive: boolean;
}

function minimumFrom(details: unknown): number | null {
  if (typeof details === 'object' && details !== null && 'minNextBidCents' in details) {
    const value = details.minNextBidCents;
    return typeof value === 'number' ? value : null;
  }
  return null;
}

export function describeBidFailure(error: unknown): BidFailure {
  if (!isApiError(error)) {
    return { message: errorMessage(error), refresh: false, definitive: false };
  }
  const definitive = error.status < 500;
  switch (error.code) {
    case 'BID_TOO_LOW': {
      const minimum = minimumFrom(error.details);
      return {
        message:
          minimum === null
            ? 'Your bid is too low.'
            : `Your bid is too low. The minimum is now ${formatMoney(minimum)}.`,
        refresh: true,
        definitive,
      };
    }
    case 'BID_CONFLICT':
      return {
        message:
          'Other bids changed the price at the same moment. Check the latest price and try again.',
        refresh: true,
        definitive,
      };
    case 'AUCTION_ENDED':
    case 'AUCTION_NOT_ACTIVE':
      return { message: 'This auction is no longer accepting bids.', refresh: true, definitive };
    case 'SELF_BID_FORBIDDEN':
      return { message: 'You cannot bid on your own lot.', refresh: false, definitive };
    default:
      if (error.status === 429) {
        return {
          message: 'Too many bids in a short time. Wait a moment and try again.',
          refresh: false,
          definitive,
        };
      }
      return { message: errorMessage(error), refresh: false, definitive };
  }
}
