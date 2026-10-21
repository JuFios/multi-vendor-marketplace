/**
 * The ISO 8601 range covering whole local days: from the first instant of `from` to the last
 * millisecond of `to`, as the finance and ledger endpoints treat both ends as inclusive.
 */
export function dayRangeToIso(period: { from: string; to: string }): { from: string; to: string } {
  return {
    from: new Date(`${period.from}T00:00:00.000`).toISOString(),
    to: new Date(`${period.to}T23:59:59.999`).toISOString(),
  };
}
