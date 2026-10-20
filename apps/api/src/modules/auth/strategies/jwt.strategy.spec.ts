import type { ConfigType } from '@nestjs/config';

import type { authConfig } from '../../../config/auth.config';

import { JwtStrategy } from './jwt.strategy';

const config = {
  accessSecret: 'unit-test-secret-of-at-least-32-characters',
} as ConfigType<typeof authConfig>;

describe('JwtStrategy.validate', () => {
  const strategy = new JwtStrategy(config);

  it('maps the claims to an AuthUser', () => {
    expect(
      strategy.validate({ sub: 'u-1', roles: ['CUSTOMER', 'SELLER'], sellerId: 's-1' }),
    ).toEqual({ userId: 'u-1', roles: ['CUSTOMER', 'SELLER'], sellerId: 's-1' });
  });

  it('omits sellerId when the token has none', () => {
    expect(strategy.validate({ sub: 'u-1', roles: ['CUSTOMER'] })).toEqual({
      userId: 'u-1',
      roles: ['CUSTOMER'],
    });
  });

  it('rejects claims without a subject or roles', () => {
    expect(strategy.validate({ roles: ['CUSTOMER'] })).toBe(false);
    expect(strategy.validate({ sub: 'u-1' })).toBe(false);
  });
});
