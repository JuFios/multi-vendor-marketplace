import { judgeRefreshToken } from './refresh-token-state';

describe('judgeRefreshToken', () => {
  it('treats a missing token as unknown', () => {
    expect(judgeRefreshToken(null)).toBe('unknown');
  });

  it('lets an unrevoked, unexpired token through', () => {
    expect(judgeRefreshToken({ revokedAt: null, expired: false })).toBe('active');
  });

  it('flags a revoked token as reuse, even when it is also expired', () => {
    expect(judgeRefreshToken({ revokedAt: new Date(), expired: false })).toBe('reused');
    expect(judgeRefreshToken({ revokedAt: new Date(), expired: true })).toBe('reused');
  });

  it('treats an unrevoked expired token as plainly expired', () => {
    expect(judgeRefreshToken({ revokedAt: null, expired: true })).toBe('expired');
  });
});
