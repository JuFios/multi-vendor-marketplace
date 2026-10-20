import { PassportStrategy } from '@nestjs/passport';
import { type Profile, Strategy } from 'passport-google-oauth20';

import type { GoogleOAuthConfig } from '../../../config/auth.config';
import { normalizeEmail } from '../../users/email';
import { GOOGLE_STRATEGY_NAME } from '../auth.constants';
import type { GoogleProfile } from '../google-login';

/**
 * Talks to Google: sends the browser there and, on return, exchanges the code and reads the
 * profile. Tests replace this provider with a strategy of the same name that needs no network.
 * The `state` check is done by the callback guard, so no server-side session is needed.
 */
export class GoogleStrategy extends PassportStrategy(Strategy, GOOGLE_STRATEGY_NAME) {
  constructor(options: GoogleOAuthConfig) {
    super({
      clientID: options.clientId,
      clientSecret: options.clientSecret,
      callbackURL: options.callbackUrl,
      scope: ['openid', 'email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleProfile {
    const primary = profile.emails?.[0];
    const email = primary?.value ?? '';
    const claim = (profile._json as { email_verified?: unknown } | undefined)?.email_verified;
    const verified = (primary?.verified as unknown) === true || claim === true || claim === 'true';
    return {
      sub: profile.id,
      email: normalizeEmail(email),
      emailVerified: email !== '' && verified,
      name: profile.displayName,
    };
  }
}
