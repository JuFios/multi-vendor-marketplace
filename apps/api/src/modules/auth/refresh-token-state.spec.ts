import { judgeRefreshToken } from './refresh-token-state';

const revokedAt = new Date();

describe('judgeRefreshToken', () => {
  it('treats a missing token as unknown', () => {
    expect(judgeRefreshToken(null)).toBe('unknown');
  });

  it('lets an unrevoked, unexpired token through', () => {
    expect(judgeRefreshToken({ revokedAt: null, replacedById: null, expired: false })).toBe(
      'active',
    );
  });

  it('flags a rotated token as reuse, even when it is also expired', () => {
    expect(judgeRefreshToken({ revokedAt, replacedById: 'successor', expired: false })).toBe(
      'reused',
    );
    expect(judgeRefreshToken({ revokedAt, replacedById: 'successor', expired: true })).toBe(
      'reused',
    );
  });

  it('treats a token revoked without rotation as revoked, even when it is also expired', () => {
    expect(judgeRefreshToken({ revokedAt, replacedById: null, expired: false })).toBe('revoked');
    expect(judgeRefreshToken({ revokedAt, replacedById: null, expired: true })).toBe('revoked');
  });

  it('treats an unrevoked expired token as plainly expired', () => {
    expect(judgeRefreshToken({ revokedAt: null, replacedById: null, expired: true })).toBe(
      'expired',
    );
  });
});
