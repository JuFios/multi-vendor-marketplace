/** Cap on a single amount in a request: 1 000 000 UAH, far below what a column can hold. */
export const MAX_MONEY_CENTS = 100_000_000;

/** Every money column is a 32-bit integer; a total above this cannot be stored. */
export const MAX_STORED_MONEY_CENTS = 2_147_483_647;

/** Whether a totalled amount still fits the money columns. */
export function fitsStoredMoney(cents: number): boolean {
  return Number.isSafeInteger(cents) && Math.abs(cents) <= MAX_STORED_MONEY_CENTS;
}
