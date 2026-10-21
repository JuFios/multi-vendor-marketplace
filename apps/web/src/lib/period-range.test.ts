import { describe, expect, it } from 'vitest';

import { dayRangeToIso } from './period-range';

describe('dayRangeToIso', () => {
  it('covers the whole first and last day in local time', () => {
    const { from, to } = dayRangeToIso({ from: '2026-03-01', to: '2026-03-31' });

    expect(new Date(from).getTime()).toBe(new Date(2026, 2, 1, 0, 0, 0, 0).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 2, 31, 23, 59, 59, 999).getTime());
  });

  it('keeps a single day as one range', () => {
    const { from, to } = dayRangeToIso({ from: '2026-03-05', to: '2026-03-05' });

    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 3600 * 1000 - 1);
  });
});
