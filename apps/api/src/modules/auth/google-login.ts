/** What Google tells us about the person who just signed in. `email` must already be normalized. */
export interface GoogleProfile {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string;
}

/** The `AuthIdentity(GOOGLE, sub)` row for this profile, if one exists. */
export interface LinkedGoogleIdentity {
  readonly userId: string;
}

/** The user that already owns the profile's email, if any. */
export interface UserWithSameEmail {
  readonly id: string;
  readonly emailVerified: boolean;
}

export type GoogleLoginDecision =
  /** The identity is already linked: sign that user in. */
  | { readonly kind: 'sign_in'; readonly userId: string }
  /**
   * Attach the identity to the existing account. The password is kept, so email and password
   * stays a working way in. Without proof of the mailbox before, whoever registered the email
   * first may not be its owner: their refresh tokens are revoked.
   */
  | {
      readonly kind: 'link';
      readonly userId: string;
      readonly markEmailVerified: boolean;
      readonly revokeRefreshTokens: boolean;
    }
  /** A new account without a password; Google has vouched for the email. */
  | {
      readonly kind: 'create_user';
      readonly email: string;
      readonly name: string;
    }
  | { readonly kind: 'rejected'; readonly reason: 'GOOGLE_EMAIL_NOT_VERIFIED' };

const NAME_MAX_LENGTH = 100;

function displayName(profile: GoogleProfile): string {
  const name = profile.name.trim();
  const fallback = profile.email.split('@')[0] ?? profile.email;
  return (name === '' ? fallback : name).slice(0, NAME_MAX_LENGTH);
}

export function resolveGoogleLogin(
  identity: LinkedGoogleIdentity | null,
  userByEmail: UserWithSameEmail | null,
  profile: GoogleProfile,
): GoogleLoginDecision {
  if (identity) {
    return { kind: 'sign_in', userId: identity.userId };
  }
  if (!profile.emailVerified) {
    return { kind: 'rejected', reason: 'GOOGLE_EMAIL_NOT_VERIFIED' };
  }
  if (userByEmail) {
    const unproven = !userByEmail.emailVerified;
    return {
      kind: 'link',
      userId: userByEmail.id,
      markEmailVerified: unproven,
      revokeRefreshTokens: unproven,
    };
  }
  return { kind: 'create_user', email: profile.email, name: displayName(profile) };
}
