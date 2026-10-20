import { type BidAttempt, validateBid } from './bid';

const NOW = new Date('2030-01-01T12:00:00.000Z');
const LATER = new Date('2030-01-01T13:00:00.000Z');

const attempt = (
  overrides: Partial<BidAttempt> = {},
  auction: Partial<BidAttempt['auction']> = {},
): BidAttempt => ({
  auction: {
    status: 'ACTIVE',
    endsAt: LATER,
    currentPriceCents: null,
    startPriceCents: 1_000,
    bidStepCents: 100,
    ...auction,
  },
  amountCents: 1_000,
  bidderId: 'buyer',
  sellerUserId: 'seller',
  now: NOW,
  ...overrides,
});

describe('validateBid', () => {
  it.each([
    ['the first bid equal to the start price', { amountCents: 1_000 }, {}],
    ['the first bid above the start price', { amountCents: 5_000 }, {}],
    [
      'a bid of exactly the leading bid plus one step',
      { amountCents: 1_600 },
      { currentPriceCents: 1_500 },
    ],
    ['a bid above that', { amountCents: 9_000 }, { currentPriceCents: 1_500 }],
  ])('accepts %s', (_name, overrides, auction) => {
    expect(validateBid(attempt(overrides, auction))).toEqual({ ok: true });
  });

  it('refuses a first bid below the start price and names the minimum', () => {
    expect(validateBid(attempt({ amountCents: 999 }))).toEqual({
      ok: false,
      code: 'BID_TOO_LOW',
      minNextBidCents: 1_000,
    });
  });

  it('refuses the leading amount itself and anything under one step above it', () => {
    const leading = { currentPriceCents: 1_500 };

    expect(validateBid(attempt({ amountCents: 1_500 }, leading))).toMatchObject({
      code: 'BID_TOO_LOW',
      minNextBidCents: 1_600,
    });
    expect(validateBid(attempt({ amountCents: 1_599 }, leading))).toMatchObject({
      code: 'BID_TOO_LOW',
    });
  });

  it('refuses a bid at or after the deadline, judged by the given clock', () => {
    expect(validateBid(attempt({ now: LATER }))).toMatchObject({ code: 'AUCTION_ENDED' });
    expect(validateBid(attempt({ now: new Date(LATER.getTime() + 1) }))).toMatchObject({
      code: 'AUCTION_ENDED',
    });
    expect(validateBid(attempt({ now: new Date(LATER.getTime() - 1) }))).toEqual({ ok: true });
  });

  it.each(['SOLD_TO_WINNER', 'ORDERED', 'NOT_SOLD'] as const)(
    'refuses a bid on an auction that is %s',
    (status) => {
      expect(validateBid(attempt({}, { status }))).toEqual({
        ok: false,
        code: 'AUCTION_NOT_ACTIVE',
        minNextBidCents: null,
      });
    },
  );

  it('refuses the seller’s own bid first of all', () => {
    expect(
      validateBid(attempt({ bidderId: 'seller', amountCents: 1 }, { status: 'NOT_SOLD' })),
    ).toMatchObject({ code: 'SELF_BID_FORBIDDEN' });
  });

  it('lets anyone bid when the store owner is unknown', () => {
    expect(validateBid(attempt({ sellerUserId: undefined }))).toEqual({ ok: true });
  });
});
