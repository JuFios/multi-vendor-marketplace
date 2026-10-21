import { fitsStoredMoney, MAX_STORED_MONEY_CENTS } from './money';

describe('fitsStoredMoney', () => {
  it.each([0, 1, 2_100_000_000, MAX_STORED_MONEY_CENTS, -MAX_STORED_MONEY_CENTS])(
    'accepts %s',
    (cents) => {
      expect(fitsStoredMoney(cents)).toBe(true);
    },
  );

  it.each([MAX_STORED_MONEY_CENTS + 1, 2_200_000_000, 10.5, Number.NaN])('rejects %s', (cents) => {
    expect(fitsStoredMoney(cents)).toBe(false);
  });
});
