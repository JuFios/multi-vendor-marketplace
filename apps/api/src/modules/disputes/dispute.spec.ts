import { assertDisputable, assertOpen, roleInDispute } from './dispute';

describe('assertDisputable', () => {
  it.each(['PROCESSING', 'SHIPPED', 'COMPLETED'])('accepts %s', (status) => {
    expect(() => assertDisputable(status)).not.toThrow();
  });

  it.each(['NEW', 'CANCELLED'])('refuses %s', (status) => {
    expect(() => assertDisputable(status)).toThrow(/cannot be opened/);
  });
});

describe('assertOpen', () => {
  it.each(['OPEN', 'UNDER_REVIEW'] as const)('accepts %s', (status) => {
    expect(() => assertOpen(status)).not.toThrow();
  });

  it.each(['RESOLVED_BUYER_FAVOR', 'RESOLVED_SELLER_FAVOR'] as const)('refuses %s', (status) => {
    expect(() => assertOpen(status)).toThrow(/already resolved/);
  });
});

describe('roleInDispute', () => {
  const dispute = { customerId: 'c1', sellerId: 's1' };

  it('tells the three parties apart', () => {
    expect(roleInDispute(dispute, { userId: 'c1', isAdmin: false })).toBe('CUSTOMER');
    expect(roleInDispute(dispute, { userId: 'u2', sellerId: 's1', isAdmin: false })).toBe('SELLER');
    expect(roleInDispute(dispute, { userId: 'a1', isAdmin: true })).toBe('ADMIN');
  });

  it('excludes everybody else', () => {
    expect(roleInDispute(dispute, { userId: 'x', isAdmin: false })).toBeNull();
    expect(roleInDispute(dispute, { userId: 'x', sellerId: 's2', isAdmin: false })).toBeNull();
  });

  it('counts the owner of the store as the customer when they are both', () => {
    expect(roleInDispute(dispute, { userId: 'c1', sellerId: 's1', isAdmin: false })).toBe(
      'CUSTOMER',
    );
  });
});
