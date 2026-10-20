import {
  addDays,
  comparisonPeriods,
  daysOf,
  isRealDay,
  lengthOf,
  resolvePeriod,
} from './report-period';

describe('report-period', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('knows real days from impossible ones', () => {
    expect(isRealDay('2026-02-28')).toBe(true);
    expect(isRealDay('2026-02-30')).toBe(false);
    expect(isRealDay('2026-2-3')).toBe(false);
  });

  it('lists every day of a period', () => {
    const period = { from: '2026-02-27', to: '2026-03-02' };

    expect(lengthOf(period)).toBe(4);
    expect(daysOf(period)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('defaults to the last 30 days ending today', () => {
    expect(resolvePeriod(undefined, undefined, '2026-03-30')).toEqual({
      from: '2026-03-01',
      to: '2026-03-30',
    });
    expect(resolvePeriod(undefined, '2026-03-10', '2026-03-30')).toEqual({
      from: '2026-02-09',
      to: '2026-03-10',
    });
    expect(resolvePeriod('2026-03-05', undefined, '2026-03-30')).toEqual({
      from: '2026-03-05',
      to: '2026-03-30',
    });
  });

  it('puts the previous period right before the current one, as long', () => {
    const { current, previous } = comparisonPeriods(7, '2026-03-10');

    expect(current).toEqual({ from: '2026-03-04', to: '2026-03-10' });
    expect(previous).toEqual({ from: '2026-02-25', to: '2026-03-03' });
  });
});
