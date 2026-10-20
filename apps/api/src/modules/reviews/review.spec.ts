import { decideEligibility } from './review';

describe('decideEligibility', () => {
  it('allows a customer with a completed purchase and no review', () => {
    expect(decideEligibility({ completedItemId: 'item', alreadyReviewed: false })).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it('refuses without a completed purchase', () => {
    expect(decideEligibility({ completedItemId: null, alreadyReviewed: false })).toEqual({
      eligible: false,
      reason: 'NOT_PURCHASED',
    });
  });

  it('refuses a second review', () => {
    expect(decideEligibility({ completedItemId: 'item', alreadyReviewed: true })).toEqual({
      eligible: false,
      reason: 'ALREADY_REVIEWED',
    });
  });

  it('reports the missing purchase first', () => {
    expect(decideEligibility({ completedItemId: null, alreadyReviewed: true }).reason).toBe(
      'NOT_PURCHASED',
    );
  });
});
