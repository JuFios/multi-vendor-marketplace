import type { NestExpressApplication } from '@nestjs/platform-express';

import { AccessTokenService } from '../../src/modules/auth';
import type { UserRole } from '../../src/modules/users';

/** `Authorization` header value for a user, signed exactly like a login would. */
export async function bearerFor(
  app: NestExpressApplication,
  user: { id: string; roles?: readonly UserRole[]; sellerId?: string },
): Promise<string> {
  const { token } = await app.get(AccessTokenService, { strict: false }).issue({
    sub: user.id,
    roles: user.roles ?? ['CUSTOMER'],
    ...(user.sellerId === undefined ? {} : { sellerId: user.sellerId }),
  });
  return `Bearer ${token}`;
}

/** The `rt=...` Set-Cookie line of a response, or an empty string when there is none. */
export function refreshCookieOf(response: { headers: Record<string, unknown> }): string {
  const cookies = (response.headers['set-cookie'] ?? []) as string[];
  return cookies.find((cookie) => cookie.startsWith('rt=')) ?? '';
}

/** The token carried by an `rt=...; Path=...` cookie line. */
export const cookieValue = (cookie: string): string =>
  cookie.split(';')[0]?.slice('rt='.length) ?? '';
