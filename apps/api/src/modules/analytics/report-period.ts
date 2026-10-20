/** A run of calendar days, `YYYY-MM-DD`, both ends included. */
export interface Period {
  readonly from: string;
  readonly to: string;
}

export const MAX_PERIOD_DAYS = 366;
export const DEFAULT_PERIOD_DAYS = 30;

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The day as a UTC timestamp, or null when it is not a real calendar day. */
function dayStart(day: string): number | null {
  if (!DAY_PATTERN.test(day)) {
    return null;
  }
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== day ? null : time;
}

export const isRealDay = (day: string): boolean => dayStart(day) !== null;

export function addDays(day: string, days: number): string {
  const start = dayStart(day);
  if (start === null) {
    throw new RangeError(`not a calendar day: ${day}`);
  }
  return new Date(start + days * DAY_MS).toISOString().slice(0, 10);
}

/** Number of days in the period. */
export function lengthOf(period: Period): number {
  return Math.round(((dayStart(period.to) ?? 0) - (dayStart(period.from) ?? 0)) / DAY_MS) + 1;
}

export function daysOf(period: Period): string[] {
  return Array.from({ length: lengthOf(period) }, (_, index) => addDays(period.from, index));
}

/** The period asked for; the missing end defaults so that, with none given, it is the last 30 days. */
export function resolvePeriod(
  from: string | undefined,
  to: string | undefined,
  today: string,
): Period {
  const end = to ?? today;
  return { from: from ?? addDays(end, 1 - DEFAULT_PERIOD_DAYS), to: end };
}

/** The last `days` days up to and including today, and the same number of days right before. */
export function comparisonPeriods(
  days: number,
  today: string,
): { current: Period; previous: Period } {
  const current = { from: addDays(today, 1 - days), to: today };
  return {
    current,
    previous: { from: addDays(current.from, -days), to: addDays(current.from, -1) },
  };
}
