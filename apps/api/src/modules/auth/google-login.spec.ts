import { type GoogleProfile, resolveGoogleLogin } from './google-login';

const profile: GoogleProfile = {
  sub: 'google-sub-1',
  email: 'olena@example.com',
  emailVerified: true,
  name: 'Olena Koval',
};

describe('resolveGoogleLogin', () => {
  describe('1. the Google identity is already linked', () => {
    it('signs in the linked user', () => {
      expect(resolveGoogleLogin({ userId: 'user-1' }, null, profile)).toEqual({
        kind: 'sign_in',
        userId: 'user-1',
      });
    });

    it('prefers the linked user over a different account with the same email', () => {
      expect(
        resolveGoogleLogin({ userId: 'user-1' }, { id: 'user-2', emailVerified: true }, profile),
      ).toEqual({ kind: 'sign_in', userId: 'user-1' });
    });

    it('does not depend on the email being verified any more', () => {
      expect(
        resolveGoogleLogin({ userId: 'user-1' }, null, { ...profile, emailVerified: false }),
      ).toEqual({ kind: 'sign_in', userId: 'user-1' });
    });
  });

  describe('2. merge into an existing account with the same email', () => {
    it('links an account whose email was never verified, verifies it and revokes its sessions', () => {
      expect(resolveGoogleLogin(null, { id: 'user-1', emailVerified: false }, profile)).toEqual({
        kind: 'link',
        userId: 'user-1',
        markEmailVerified: true,
        revokeRefreshTokens: true,
      });
    });

    it('links an already verified account without touching its sessions', () => {
      expect(resolveGoogleLogin(null, { id: 'user-1', emailVerified: true }, profile)).toEqual({
        kind: 'link',
        userId: 'user-1',
        markEmailVerified: false,
        revokeRefreshTokens: false,
      });
    });

    it('never asks to clear the password: the decision has no such field', () => {
      const decision = resolveGoogleLogin(null, { id: 'user-1', emailVerified: false }, profile);

      expect(Object.keys(decision).sort()).toEqual([
        'kind',
        'markEmailVerified',
        'revokeRefreshTokens',
        'userId',
      ]);
    });
  });

  describe('3. new account', () => {
    it('creates a user from a verified profile', () => {
      expect(resolveGoogleLogin(null, null, profile)).toEqual({
        kind: 'create_user',
        email: 'olena@example.com',
        name: 'Olena Koval',
      });
    });

    it('falls back to the local part of the email when Google sends no name', () => {
      expect(resolveGoogleLogin(null, null, { ...profile, name: '   ' })).toMatchObject({
        name: 'olena',
      });
    });

    it('caps the name length', () => {
      const decision = resolveGoogleLogin(null, null, { ...profile, name: 'x'.repeat(300) });

      expect(decision.kind === 'create_user' && decision.name).toHaveLength(100);
    });
  });

  describe('4. unverified Google email', () => {
    it('is rejected when there is no matching account', () => {
      expect(resolveGoogleLogin(null, null, { ...profile, emailVerified: false })).toEqual({
        kind: 'rejected',
        reason: 'GOOGLE_EMAIL_NOT_VERIFIED',
      });
    });

    it('is rejected instead of merged into the matching account', () => {
      expect(
        resolveGoogleLogin(
          null,
          { id: 'user-1', emailVerified: true },
          {
            ...profile,
            emailVerified: false,
          },
        ),
      ).toEqual({ kind: 'rejected', reason: 'GOOGLE_EMAIL_NOT_VERIFIED' });
    });
  });
});
