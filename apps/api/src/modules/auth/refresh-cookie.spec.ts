import type { Response } from 'express';

import { clearRefreshCookie, setRefreshCookie } from './refresh-cookie';

function fakeResponse(): { res: Response; cookie: jest.Mock; clearCookie: jest.Mock } {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  return { res: { cookie, clearCookie } as unknown as Response, cookie, clearCookie };
}

describe('refresh cookie', () => {
  const expiresAt = new Date('2026-02-01T00:00:00Z');

  it('is httpOnly, SameSite=Lax and scoped to the auth routes', () => {
    const { res, cookie } = fakeResponse();

    setRefreshCookie(res, 'token', expiresAt, false);

    expect(cookie).toHaveBeenCalledWith('rt', 'token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
      expires: expiresAt,
    });
  });

  it('is Secure when asked to (production)', () => {
    const { res, cookie } = fakeResponse();

    setRefreshCookie(res, 'token', expiresAt, true);

    expect(cookie).toHaveBeenCalledWith('rt', 'token', expect.objectContaining({ secure: true }));
  });

  it('is cleared with the same scope it was set with', () => {
    const { res, clearCookie } = fakeResponse();

    clearRefreshCookie(res, true);

    expect(clearCookie).toHaveBeenCalledWith('rt', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/auth',
    });
  });
});
