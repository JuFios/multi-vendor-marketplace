import type { SalesChart } from './admin-api';

export type ChartMetric = 'grossCents' | 'commissionCents' | 'ordersCount';

export const METRIC_LABELS: Record<ChartMetric, string> = {
  grossCents: 'Gross sales',
  commissionCents: 'Platform revenue',
  ordersCount: 'Orders',
};

export interface ChartPoint {
  /** 1-based day of the period, so both periods line up on one axis. */
  day: number;
  current: number | null;
  previous: number | null;
  currentDate: string | null;
  previousDate: string | null;
}

type Day = SalesChart['current'][number];

export function mergeSeries(
  current: readonly Day[],
  previous: readonly Day[],
  metric: ChartMetric,
): ChartPoint[] {
  const length = Math.max(current.length, previous.length);
  return Array.from({ length }, (_, index) => ({
    day: index + 1,
    current: current[index]?.[metric] ?? null,
    previous: previous[index]?.[metric] ?? null,
    currentDate: current[index]?.date ?? null,
    previousDate: previous[index]?.date ?? null,
  }));
}

/** Percent change from the previous value, or null when there is nothing to compare with. */
export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function formatDelta(delta: number | null): string {
  if (delta === null) {
    return '—';
  }
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}
