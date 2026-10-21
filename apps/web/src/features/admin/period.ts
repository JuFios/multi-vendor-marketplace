function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The last 30 days, today included, as `YYYY-MM-DD` dates in local time. */
export function defaultPeriod(now = new Date()): { from: string; to: string } {
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  return { from: isoDay(start), to: isoDay(now) };
}
