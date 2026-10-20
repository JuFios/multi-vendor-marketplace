import { deltaPct, deltasOf, fillSeries, totalsOf } from './sales-series';

describe('fillSeries', () => {
  it('has an entry for every day, zero where nothing was sold', () => {
    const series = fillSeries({ from: '2026-03-01', to: '2026-03-04' }, [
      { date: '2026-03-02', grossCents: 500, commissionCents: 50, ordersCount: 1 },
      { date: '2026-03-04', grossCents: 200, commissionCents: 20, ordersCount: 2 },
    ]);

    expect(series.map((day) => day.date)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
    expect(series[0]).toEqual({
      date: '2026-03-01',
      grossCents: 0,
      commissionCents: 0,
      ordersCount: 0,
    });
    expect(series[1]?.grossCents).toBe(500);
    expect(totalsOf(series)).toEqual({ grossCents: 700, commissionCents: 70, ordersCount: 3 });
  });
});

describe('deltaPct', () => {
  it('is the change from previous to current in percent, two decimals', () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(100, 300)).toBe(-66.67);
  });

  it('has nothing to compare with when the previous period was empty', () => {
    expect(deltaPct(100, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });

  it('works per figure', () => {
    expect(
      deltasOf(
        { grossCents: 200, commissionCents: 0, ordersCount: 3 },
        { grossCents: 100, commissionCents: 0, ordersCount: 4 },
      ),
    ).toEqual({ grossCents: 100, commissionCents: null, ordersCount: -25 });
  });
});
