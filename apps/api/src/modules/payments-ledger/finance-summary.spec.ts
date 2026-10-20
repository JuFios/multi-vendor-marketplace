import { summarizeLedger } from './finance-summary';

describe('summarizeLedger', () => {
  it('is all zeros for an empty ledger', () => {
    expect(summarizeLedger({}, 0)).toEqual({
      grossCents: 0,
      refundsCents: 0,
      commissionCents: 0,
      netCents: 0,
      paidOutCents: 0,
      balanceCents: 0,
    });
  });

  it('reads a refunded and paid out sale', () => {
    const summary = summarizeLedger(
      {
        SALE: 10_000,
        COMMISSION: -1_000,
        REFUND: -4_000,
        COMMISSION_REVERSAL: 400,
        PAYOUT: -5_400,
      },
      0,
    );

    expect(summary).toEqual({
      grossCents: 10_000,
      refundsCents: 4_000,
      commissionCents: 600,
      netCents: 5_400,
      paidOutCents: 5_400,
      balanceCents: 0,
    });
  });

  it('counts a cancelled sale as money given back and the commission as returned', () => {
    const summary = summarizeLedger(
      { SALE: 10_000, COMMISSION: -1_000, CANCELLATION: -10_000, COMMISSION_REVERSAL: 1_000 },
      0,
    );

    expect(summary).toMatchObject({ refundsCents: 10_000, commissionCents: 0, netCents: 0 });
  });

  it('keeps the balance it is given, since it is not limited to the period', () => {
    expect(summarizeLedger({ SALE: 1_000 }, 7_500).balanceCents).toBe(7_500);
  });
});
