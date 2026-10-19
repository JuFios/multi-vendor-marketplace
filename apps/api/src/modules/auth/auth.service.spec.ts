import { Logger } from '@nestjs/common';

import { EmailAlreadyRegisteredError, type UserCredentials, type UsersService } from '../users';

import {
  GoogleAuthFailedError,
  GoogleEmailNotVerifiedError,
  InvalidCredentialsError,
} from './auth.errors';
import type { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import type { PasswordHasher } from './password-hasher.service';
import type { AuthSession, SessionService } from './session.service';

const user: UserCredentials = {
  id: '6f1d3c1e-0b0a-4c55-9d0b-0b6f6a1b2c3d',
  email: 'buyer@example.com',
  name: 'Buyer',
  roles: ['CUSTOMER'],
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  passwordHash: '$argon2id$stored',
};

const session = { accessToken: 'jwt' } as AuthSession;
const client = { ip: '203.0.113.7', userAgent: 'jest' };

describe('AuthService', () => {
  const users = {
    create: jest.fn(),
    findCredentialsByEmail: jest.fn(),
    findByEmail: jest.fn(),
    getById: jest.fn(),
    markEmailVerified: jest.fn(),
  };
  const auth = {
    findGoogleIdentity: jest.fn(),
    createGoogleIdentity: jest.fn(),
    revokeAllForUser: jest.fn(),
  };
  const hasher = { hash: jest.fn(), verify: jest.fn() };
  const sessions = { start: jest.fn() };
  const txHost = { withTransaction: jest.fn((work: () => unknown) => work()) };
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    txHost.withTransaction.mockImplementation((work: () => unknown) => work());
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    sessions.start.mockResolvedValue(session);
    service = new AuthService(
      txHost as never,
      users as unknown as UsersService,
      hasher as unknown as PasswordHasher,
      sessions as unknown as SessionService,
      auth as unknown as AuthRepository,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('register', () => {
    it('stores only the password hash and signs the new user in', async () => {
      hasher.hash.mockResolvedValue('$argon2id$new');
      users.create.mockResolvedValue(user);

      const result = await service.register(
        { email: 'buyer@example.com', password: 'secret-pass-1', name: 'Buyer' },
        client,
      );

      expect(users.create).toHaveBeenCalledWith({
        email: 'buyer@example.com',
        name: 'Buyer',
        passwordHash: '$argon2id$new',
      });
      expect(sessions.start).toHaveBeenCalledWith(user, client);
      expect(result).toBe(session);
    });

    it('creates the user and its refresh token in one transaction', async () => {
      hasher.hash.mockResolvedValue('$argon2id$new');
      users.create.mockResolvedValue(user);

      await service.register(
        { email: 'a@example.com', password: 'secret-pass-1', name: 'A' },
        client,
      );

      expect(txHost.withTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('signs in on a matching password and logs the success without email or password', async () => {
      users.findCredentialsByEmail.mockResolvedValue(user);
      hasher.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: 'buyer@example.com', password: 'secret-pass-1' }, client),
      ).resolves.toBe(session);

      expect(log).toHaveBeenCalledWith({
        msg: 'auth.login.success',
        userId: user.id,
        ip: client.ip,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain('buyer@example.com');
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret-pass-1');
    });

    it('fails identically for an unknown email and a wrong password', async () => {
      users.findCredentialsByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
      hasher.verify.mockResolvedValue(false);

      const unknown = await service
        .login({ email: 'nobody@example.com', password: 'secret-pass-1' }, client)
        .catch((error: unknown) => error);
      const wrong = await service
        .login({ email: 'buyer@example.com', password: 'wrong-pass-1' }, client)
        .catch((error: unknown) => error);

      expect(unknown).toBeInstanceOf(InvalidCredentialsError);
      expect(wrong).toBeInstanceOf(InvalidCredentialsError);
      expect((unknown as Error).message).toBe((wrong as Error).message);
      expect(sessions.start).not.toHaveBeenCalled();
    });

    it('still verifies against a dummy hash for an unknown email', async () => {
      users.findCredentialsByEmail.mockResolvedValue(null);
      hasher.verify.mockResolvedValue(false);

      await service
        .login({ email: 'nobody@example.com', password: 'secret-pass-1' }, client)
        .catch(() => undefined);

      expect(hasher.verify).toHaveBeenCalledWith(null, 'secret-pass-1');
    });

    it('logs the failure reason server-side without the email', async () => {
      users.findCredentialsByEmail
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce({ ...user, passwordHash: null });
      hasher.verify.mockResolvedValue(false);

      for (const email of ['nobody@example.com', 'buyer@example.com', 'google@example.com']) {
        await service.login({ email, password: 'secret-pass-1' }, client).catch(() => undefined);
      }

      expect(warn.mock.calls.map(([entry]) => (entry as { reason: string }).reason)).toEqual([
        'unknown_user',
        'bad_password',
        'no_password',
      ]);
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ msg: 'auth.login.failure' }));
      expect(JSON.stringify(warn.mock.calls)).not.toContain('@example.com');
    });
  });

  describe('loginWithGoogle', () => {
    const profile = {
      sub: 'google-sub-1',
      email: 'Buyer@Example.com',
      emailVerified: true,
      name: 'Buyer',
    };
    const calls: string[] = [];

    beforeEach(() => {
      calls.length = 0;
      auth.findGoogleIdentity.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.getById.mockResolvedValue(user);
      auth.revokeAllForUser.mockImplementation(() => calls.push('revoke'));
      sessions.start.mockImplementation(() => {
        calls.push('start');
        return session;
      });
    });

    it('signs in the user of an already linked identity', async () => {
      auth.findGoogleIdentity.mockResolvedValue({ userId: user.id });

      await service.loginWithGoogle(profile, client);

      expect(users.findByEmail).not.toHaveBeenCalled();
      expect(auth.createGoogleIdentity).not.toHaveBeenCalled();
      expect(sessions.start).toHaveBeenCalledWith(user, client);
    });

    it('merges into an unverified account: keeps the password, verifies, revokes, then signs in', async () => {
      users.findByEmail.mockResolvedValue({ ...user, emailVerified: false });

      await service.loginWithGoogle(profile, client);

      expect(users.findByEmail).toHaveBeenCalledWith('buyer@example.com');
      expect(auth.createGoogleIdentity).toHaveBeenCalledWith({
        userId: user.id,
        providerUserId: 'google-sub-1',
        email: 'buyer@example.com',
      });
      expect(users.markEmailVerified).toHaveBeenCalledWith(user.id);
      expect(auth.revokeAllForUser).toHaveBeenCalledWith(user.id);
      // The new session must be created after the old ones are revoked, or it would be revoked too.
      expect(calls).toEqual(['revoke', 'start']);
      expect(users.create).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith({
        msg: 'auth.google.linked',
        userId: user.id,
        sessionsRevoked: true,
        ip: client.ip,
      });
    });

    it('merges into a verified account without revoking its sessions', async () => {
      users.findByEmail.mockResolvedValue({ ...user, emailVerified: true });

      await service.loginWithGoogle(profile, client);

      expect(auth.createGoogleIdentity).toHaveBeenCalled();
      expect(users.markEmailVerified).not.toHaveBeenCalled();
      expect(auth.revokeAllForUser).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ sessionsRevoked: false }));
    });

    it('creates a verified account without a password for a new email', async () => {
      users.create.mockResolvedValue({ ...user, id: 'new-user' });

      await service.loginWithGoogle(profile, client);

      expect(users.create).toHaveBeenCalledWith({
        email: 'buyer@example.com',
        name: 'Buyer',
        passwordHash: null,
        emailVerified: true,
      });
      expect(auth.createGoogleIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'new-user' }),
      );
    });

    it('rejects an unverified Google email and changes nothing', async () => {
      users.findByEmail.mockResolvedValue({ ...user, emailVerified: true });

      await expect(
        service.loginWithGoogle({ ...profile, emailVerified: false }, client),
      ).rejects.toBeInstanceOf(GoogleEmailNotVerifiedError);

      expect(auth.createGoogleIdentity).not.toHaveBeenCalled();
      expect(users.markEmailVerified).not.toHaveBeenCalled();
      expect(auth.revokeAllForUser).not.toHaveBeenCalled();
      expect(sessions.start).not.toHaveBeenCalled();
    });

    it('turns a lost race for the same new email into a retryable failure', async () => {
      users.create.mockRejectedValue(new EmailAlreadyRegisteredError());

      await expect(service.loginWithGoogle(profile, client)).rejects.toBeInstanceOf(
        GoogleAuthFailedError,
      );
    });

    it('lets other failures through untouched', async () => {
      const failure = new Error('connection lost');
      users.create.mockRejectedValue(failure);

      await expect(service.loginWithGoogle(profile, client)).rejects.toBe(failure);
    });

    it('does not look an account up by an empty email', async () => {
      await expect(
        service.loginWithGoogle({ ...profile, email: '', emailVerified: false }, client),
      ).rejects.toBeInstanceOf(GoogleEmailNotVerifiedError);

      expect(users.findByEmail).not.toHaveBeenCalled();
    });
  });
});
