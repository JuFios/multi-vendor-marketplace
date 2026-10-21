import { describe, expect, it } from 'vitest';

import { bidSchema } from './bid-schema';

const messageFor = (amount: string): string | undefined => {
  const result = bidSchema(12_500).safeParse({ amount });
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe('bidSchema', () => {
  it('accepts the minimum and anything above it', () => {
    expect(messageFor('125')).toBeUndefined();
    expect(messageFor('125.50')).toBeUndefined();
  });

  it('refuses an amount below the minimum', () => {
    expect(messageFor('124.99')).toBe('Minimum bid is $125.00');
  });

  it('refuses text that is not an amount', () => {
    expect(messageFor('abc')).toBe('Enter an amount like 125.50');
  });

  it('refuses an amount the api would not accept', () => {
    expect(messageFor('1000000.01')).toBe('Maximum bid is $1,000,000.00');
    expect(messageFor('15001510')).toBe('Maximum bid is $1,000,000.00');
    expect(messageFor('1000000')).toBeUndefined();
  });
});
