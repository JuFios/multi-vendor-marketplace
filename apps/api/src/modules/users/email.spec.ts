import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('lower-cases the address', () => {
    expect(normalizeEmail('Buyer@Example.COM')).toBe('buyer@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  buyer@example.com\n')).toBe('buyer@example.com');
  });
});
