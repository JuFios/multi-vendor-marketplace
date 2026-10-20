import {
  AUCTION_MAX_DURATION_SEC,
  AUCTION_MIN_DURATION_SEC,
  isAllowedDuration,
  maskBidder,
  minNextBidCents,
} from './auction';

describe('minNextBidCents', () => {
  it('is the start price while nobody has bid', () => {
    expect(
      minNextBidCents({ currentPriceCents: null, startPriceCents: 1_000, bidStepCents: 100 }),
    ).toBe(1_000);
  });

  it('is the leading bid plus one step afterwards', () => {
    expect(
      minNextBidCents({ currentPriceCents: 1_000, startPriceCents: 1_000, bidStepCents: 250 }),
    ).toBe(1_250);
  });
});

describe('isAllowedDuration', () => {
  it.each([
    [AUCTION_MIN_DURATION_SEC, true],
    [AUCTION_MAX_DURATION_SEC, true],
    [AUCTION_MIN_DURATION_SEC - 1, false],
    [AUCTION_MAX_DURATION_SEC + 1, false],
    [0, false],
    [-5, false],
  ])('%s s is %s', (seconds, allowed) => {
    expect(isAllowedDuration(seconds)).toBe(allowed);
  });
});

describe('maskBidder', () => {
  it('is stable for one bidder in one auction', () => {
    expect(maskBidder('u1', 'a1')).toBe(maskBidder('u1', 'a1'));
    expect(maskBidder('u1', 'a1')).toMatch(/^Bidder #[0-9a-f]{4}$/);
  });

  it('differs between bidders and between auctions', () => {
    expect(maskBidder('u1', 'a1')).not.toBe(maskBidder('u2', 'a1'));
    expect(maskBidder('u1', 'a1')).not.toBe(maskBidder('u1', 'a2'));
  });

  it('does not reveal the id', () => {
    expect(maskBidder('9f1c0b6e-0000-4000-8000-000000000001', 'a1')).not.toContain('9f1c');
  });
});
