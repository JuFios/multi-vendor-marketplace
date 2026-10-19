import { registerAs } from '@nestjs/config';

import { loadEnv, NodeEnv } from './env.validation';

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly callbackUrl: string;
}

export const authConfig = registerAs('auth', () => {
  const env = loadEnv();
  const google: GoogleOAuthConfig | null =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackUrl: env.GOOGLE_CALLBACK_URL,
        }
      : null;
  return {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtlSec: env.JWT_ACCESS_TTL_SEC,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    cookieSecure:
      env.COOKIE_SECURE === undefined
        ? env.NODE_ENV === NodeEnv.Production
        : env.COOKIE_SECURE === 'true',
    google,
  };
});
