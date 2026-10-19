import type { Request } from 'express';
import passport from 'passport';

import type { GoogleProfile } from '../../src/modules/auth/google-login';

/** Stands in for the real strategy (no network): the authorization `code` carries the profile. */
export const googleCode = (profile: GoogleProfile): string =>
  Buffer.from(JSON.stringify(profile)).toString('base64url');

export const FAKE_GOOGLE_AUTH_URL = 'https://accounts.google.test/auth';

/**
 * Registers itself under the name `google` like the real strategy does. Provide it in place of
 * `GoogleStrategy` to exercise the whole Google flow, guards and callback included.
 */
export class FakeGoogleStrategy {
  readonly name = 'google';

  // Attached by passport for every request.
  success!: (user: unknown) => void;
  fail!: () => void;
  redirect!: (url: string, status?: number) => void;

  constructor() {
    passport.use('google', this);
  }

  authenticate(req: Request, options: { state?: string }): void {
    const { code, error } = req.query;
    if (typeof code === 'string') {
      this.success(JSON.parse(Buffer.from(code, 'base64url').toString()) as GoogleProfile);
    } else if (error !== undefined) {
      this.fail();
    } else {
      this.redirect(`${FAKE_GOOGLE_AUTH_URL}?state=${options.state ?? ''}`);
    }
  }
}
