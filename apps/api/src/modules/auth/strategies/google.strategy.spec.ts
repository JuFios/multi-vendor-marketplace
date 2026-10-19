import type { Profile } from 'passport-google-oauth20';

import { GoogleStrategy } from './google.strategy';

const strategy = new GoogleStrategy({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  callbackUrl: 'http://localhost:3000/api/auth/google/callback',
});

const profileOf = (json: Record<string, unknown>, emails?: Profile['emails']): Profile =>
  ({
    id: 'google-sub-1',
    displayName: 'Olena Koval',
    provider: 'google',
    ...(emails ? { emails } : {}),
    _json: json,
    _raw: '',
  }) as unknown as Profile;

describe('GoogleStrategy.validate', () => {
  it('maps a verified profile and normalizes the email', () => {
    const result = strategy.validate(
      'access',
      'refresh',
      profileOf({ email_verified: true }, [{ value: ' Olena@Example.COM ', verified: true }]),
    );

    expect(result).toEqual({
      sub: 'google-sub-1',
      email: 'olena@example.com',
      emailVerified: true,
      name: 'Olena Koval',
    });
  });

  it('accepts the string form of email_verified', () => {
    expect(
      strategy.validate(
        'a',
        'r',
        profileOf({ email_verified: 'true' }, [{ value: 'a@example.com', verified: false }]),
      ).emailVerified,
    ).toBe(true);
  });

  it('does not trust an email Google has not verified', () => {
    expect(
      strategy.validate(
        'a',
        'r',
        profileOf({ email_verified: false }, [{ value: 'a@example.com', verified: false }]),
      ).emailVerified,
    ).toBe(false);
    expect(
      strategy.validate('a', 'r', profileOf({}, [{ value: 'a@example.com', verified: false }]))
        .emailVerified,
    ).toBe(false);
  });

  it('treats a profile without an email as unverified', () => {
    expect(strategy.validate('a', 'r', profileOf({ email_verified: true }))).toMatchObject({
      email: '',
      emailVerified: false,
    });
  });
});
