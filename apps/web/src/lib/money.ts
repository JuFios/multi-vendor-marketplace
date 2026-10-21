export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, '0');
  return `${sign}$${major.toLocaleString('en-US')}.${minor}`;
}

export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [major = '0', minor = '00'] = trimmed.split('.');
  return Number(major) * 100 + Number(minor.padEnd(2, '0'));
}

export const BPS_DENOMINATOR = 10_000;

export function calculateCommission(amountCents: number, rateBps: number): number {
  const scaled = amountCents * rateBps;
  return Math.floor((scaled + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

export function previewRefund(input: {
  subtotalCents: number;
  alreadyRefundedCents: number;
  rateBps: number;
  additionalRefundCents: number;
}): {
  refundCents: number;
  commissionCents: number;
  payoutCents: number;
} {
  const refundedCents = input.alreadyRefundedCents + input.additionalRefundCents;
  const remaining = input.subtotalCents - refundedCents;
  const commissionCents = calculateCommission(remaining, input.rateBps);
  return {
    refundCents: input.additionalRefundCents,
    commissionCents,
    payoutCents: remaining - commissionCents,
  };
}
