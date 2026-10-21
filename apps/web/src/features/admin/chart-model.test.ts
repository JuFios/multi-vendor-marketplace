import { describe, expect, it } from 'vitest';

import { deltaPercent, formatDelta, mergeSeries } from './chart-model';

const day = (date: string, grossCents: number) => ({
  date,
  grossCents,
  commissionCents: grossCents / 10,
  ordersCount: 1,
});

describe('chart model', () => {
  it('lines the two periods up by day index', () => {
    const points = mergeSeries(
      [day('2026-02-01', 200), day('2026-02-02', 300)],
      [day('2026-01-02', 100)],
      'grossCents',
    );

    expect(points).toEqual([
      {
        day: 1,
        current: 200,
        previous: 100,
        currentDate: '2026-02-01',
        previousDate: '2026-01-02',
      },
      { day: 2, current: 300, previous: null, currentDate: '2026-02-02', previousDate: null },
    ]);
  });

  it('computes the change in percent and tolerates a zero baseline', () => {
    expect(deltaPercent(150, 100)).toBe(50);
    expect(deltaPercent(50, 100)).toBe(-50);
    expect(deltaPercent(10, 0)).toBeNull();
    expect(formatDelta(12.34)).toBe('+12.3%');
    expect(formatDelta(null)).toBe('—');
  });
});
