/** Basis points in one whole (10000 = 100%). */
export const BPS_DENOMINATOR = 10_000;

/** The platform's cut of `amountCents`, rounded half up; integers only. */
export function calculateCommission(amountCents: number, rateBps: number): number {
  const scaled = amountCents * rateBps;
  if (
    !Number.isSafeInteger(amountCents) ||
    !Number.isSafeInteger(rateBps) ||
    !Number.isSafeInteger(scaled)
  ) {
    throw new RangeError('Commission inputs must be safe integers');
  }
  return Math.floor((scaled + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

export interface SellerOrderFinancials {
  readonly commissionCents: number;
  readonly payoutCents: number;
}

/** What the platform keeps and what the seller is owed for the part that was not refunded. */
export function computeSellerOrderFinancials(
  subtotalCents: number,
  refundedCents: number,
  rateBps: number,
): SellerOrderFinancials {
  const commissionCents = calculateCommission(subtotalCents - refundedCents, rateBps);
  return { commissionCents, payoutCents: subtotalCents - refundedCents - commissionCents };
}
