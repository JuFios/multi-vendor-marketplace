import type { CookieOptions, Response } from 'express';

import { REFRESH_COOKIE_NAME } from '../../common/swagger';

/** Scoped to the auth routes, so the browser never sends the refresh token to other endpoints. */
export const REFRESH_COOKIE_PATH = '/api/auth';

const baseOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: REFRESH_COOKIE_PATH,
});

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseOptions(secure), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(secure));
}
