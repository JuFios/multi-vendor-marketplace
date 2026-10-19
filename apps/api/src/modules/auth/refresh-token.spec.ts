import { hashRefreshToken, newRefreshToken } from './refresh-token';

describe('refresh token', () => {
  it('is 256 bits of URL-safe randomness, different every time', () => {
    const first = newRefreshToken();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newRefreshToken().token).not.toBe(first.token);
  });

  it('is stored as the sha256 hex digest, never as the token itself', () => {
    const { token, tokenHash } = newRefreshToken();

    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashRefreshToken(token)).toBe(tokenHash);
  });
});
