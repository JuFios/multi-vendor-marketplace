import { daysOf, type Period } from './report-period';

export interface DayTotals {
  readonly date: string;
  readonly grossCents: number;
  readonly commissionCents: number;
  readonly ordersCount: number;
}

export interface SeriesTotals {
  readonly grossCents: number;
  readonly commissionCents: number;
  readonly ordersCount: number;
}

export interface SeriesDeltaPct {
  readonly grossCents: number | null;
  readonly commissionCents: number | null;
  readonly ordersCount: number | null;
}

/** One entry per day of the period; a day without sales is zero. */
export function fillSeries(period: Period, rows: readonly DayTotals[]): DayTotals[] {
  const byDay = new Map(rows.map((row) => [row.date, row]));
  return daysOf(period).map(
    (date) => byDay.get(date) ?? { date, grossCents: 0, commissionCents: 0, ordersCount: 0 },
  );
}

export function totalsOf(series: readonly DayTotals[]): SeriesTotals {
  return series.reduce<SeriesTotals>(
    (sum, day) => ({
      grossCents: sum.grossCents + day.grossCents,
      commissionCents: sum.commissionCents + day.commissionCents,
      ordersCount: sum.ordersCount + day.ordersCount,
    }),
    { grossCents: 0, commissionCents: 0, ordersCount: 0 },
  );
}

/** Change from `previous` to `current` in percent, two decimals; null when there is nothing to compare with. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}

export function deltasOf(current: SeriesTotals, previous: SeriesTotals): SeriesDeltaPct {
  return {
    grossCents: deltaPct(current.grossCents, previous.grossCents),
    commissionCents: deltaPct(current.commissionCents, previous.commissionCents),
    ordersCount: deltaPct(current.ordersCount, previous.ordersCount),
  };
}
