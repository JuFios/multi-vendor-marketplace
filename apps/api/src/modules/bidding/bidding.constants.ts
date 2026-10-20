/** Names of the delayed jobs in the `auctions` queue; they are told apart from events by name. */
export const AUCTION_JOB = {
  CLOSE: 'auction-close',
  EXPIRE: 'auction-expire',
} as const;

export interface AuctionTimerData {
  readonly auctionId: string;
  readonly round: number;
}
