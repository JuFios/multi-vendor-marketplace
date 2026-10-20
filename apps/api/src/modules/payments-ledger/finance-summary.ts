import type { LedgerEntryKind } from './ledger.repository';

export type TotalsByType = Readonly<Partial<Record<LedgerEntryKind, number>>>;

export interface FinanceSummary {
  /** Sales booked in the period. */
  readonly grossCents: number;
  /** Money given back to buyers in the period: refunds and cancelled sales. */
  readonly refundsCents: number;
  /** The platform's commission in the period, net of what was reversed. */
  readonly commissionCents: number;
  /** `gross − refunds − commission`. */
  readonly netCents: number;
  /** Paid out to the seller in the period. */
  readonly paidOutCents: number;
  /** What the platform owes the seller now: the sum of all their entries. */
  readonly balanceCents: number;
}

/**
 * Turns signed ledger totals (the seller's point of view) into the figures a seller reads.
 * `balanceCents` is passed in because it covers all time, not the period.
 */
export function summarizeLedger(totals: TotalsByType, balanceCents: number): FinanceSummary {
  const of = (type: LedgerEntryKind): number => totals[type] ?? 0;
  const grossCents = of('SALE');
  const refundsCents = 0 - (of('REFUND') + of('CANCELLATION'));
  const commissionCents = 0 - (of('COMMISSION') + of('COMMISSION_REVERSAL'));
  return {
    grossCents,
    refundsCents,
    commissionCents,
    netCents: grossCents - refundsCents - commissionCents,
    paidOutCents: 0 - of('PAYOUT'),
    balanceCents,
  };
}
