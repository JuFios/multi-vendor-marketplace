import { describe, expect, it } from 'vitest';

import { formatCountdown, remainingMs } from './use-countdown';

describe('countdown', () => {
  it('counts from the server clock, ignoring the device clock offset', () => {
    const left = remainingMs('2026-01-01T00:10:00Z', '2026-01-01T00:00:00Z', 30_000);

    expect(left).toBe(570_000);
  });

  it('formats as hh:mm:ss and stops at zero', () => {
    expect(formatCountdown(3_725_000)).toBe('01:02:05');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });
});
