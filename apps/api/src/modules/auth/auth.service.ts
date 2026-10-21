import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { ValidationFailedError } from '../../common/exceptions/app-error';
import type { AppTransactionHost } from '../../prisma/transaction';
import { normalizeEmail } from '../users/email';
import type { UserAccount } from '../users/user-account';
import { EmailAlreadyRegisteredError } from '../users/users.errors';
import { UsersService } from '../users/users.service';

import {
  FreshSignInRequiredError,
  GoogleAuthFailedError,
  GoogleEmailNotVerifiedError,
  InvalidCredentialsError,
} from './auth.errors';
import { AuthRepository } from './auth.repository';
import { type GoogleProfile, resolveGoogleLogin } from './google-login';
import { PasswordHasher } from './password-hasher.service';
import { type AuthSession, type ClientContext, SessionService } from './session.service';

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface SetPasswordInput {
  readonly currentPassword?: string | undefined;
  readonly newPassword: string;
}

/** Leeway between the application clock (token `iat`) and the database clock (link time). */
const CLOCK_SKEW_MS = 5000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly auth: AuthRepository,
  ) {}

  async register(input: RegisterInput, client: ClientContext): Promise<AuthSession> {
    const passwordHash = await this.hasher.hash(input.password);
    return this.txHost.withTransaction(async () => {
      const user = await this.users.create({
        email: input.email,
        name: input.name,
        passwordHash,
      });
      return this.sessions.start(user, client);
    });
  }

  async login(input: LoginInput, client: ClientContext): Promise<AuthSession> {
    const user = await this.users.findCredentialsByEmail(input.email);
    const passwordMatches = await this.hasher.verify(user?.passwordHash ?? null, input.password);
    if (!user || !passwordMatches) {
      this.logger.warn({
        msg: 'auth.login.failure',
        reason: !user
          ? 'unknown_user'
          : user.passwordHash === null
            ? 'no_password'
            : 'bad_password',
        ...(user ? { userId: user.id } : {}),
        ip: client.ip,
      });
      throw new InvalidCredentialsError();
    }
    this.logger.log({ msg: 'auth.login.success', userId: user.id, ip: client.ip });
    return this.sessions.start(user, client);
  }

  /**
   * Sets the password of the signed-in user. An account that has one must confirm it first. One
   * without (created through Google, or cleared when Google was linked) sets it with a session
   * opened after the Google link: an access token issued before it may belong to whoever
   * pre-registered the address, and must not buy them a new password.
   */
  async setPassword(
    userId: string,
    input: SetPasswordInput,
    tokenIssuedAt: Date | undefined,
  ): Promise<void> {
    const user = await this.users.getCredentialsById(userId);
    if (user.passwordHash === null) {
      const linkedAt = await this.auth.lastGoogleLinkAt(userId);
      if (
        linkedAt !== null &&
        (tokenIssuedAt === undefined ||
          tokenIssuedAt.getTime() + CLOCK_SKEW_MS < linkedAt.getTime())
      ) {
        this.logger.warn({ msg: 'auth.password.set_refused_stale_session', userId });
        throw new FreshSignInRequiredError();
      }
    } else {
      const confirmed =
        input.currentPassword !== undefined &&
        (await this.hasher.verify(user.passwordHash, input.currentPassword));
      if (!confirmed) {
        this.logger.warn({ msg: 'auth.password.change_refused', userId });
        throw new ValidationFailedError(
          [{ field: 'currentPassword', message: 'The current password is not correct' }],
          'The current password is not correct',
        );
      }
    }
    await this.users.setPasswordHash(userId, await this.hasher.hash(input.newPassword));
    this.logger.log({
      msg: user.passwordHash === null ? 'auth.password.set' : 'auth.password.changed',
      userId,
    });
  }

  /**
   * Applies `resolveGoogleLogin`. When an existing account is linked without proof of its
   * mailbox, its password is cleared and its earlier sessions are revoked first, so the session
   * started here survives.
   */
  async loginWithGoogle(profile: GoogleProfile, client: ClientContext): Promise<AuthSession> {
    const googleProfile = { ...profile, email: normalizeEmail(profile.email) };
    try {
      return await this.txHost.withTransaction(() => this.applyGoogleLogin(googleProfile, client));
    } catch (error) {
      // Two first-time sign-ins for one address raced and the other created the account: retry links.
      throw error instanceof EmailAlreadyRegisteredError ? new GoogleAuthFailedError() : error;
    }
  }

  private async applyGoogleLogin(
    googleProfile: GoogleProfile,
    client: ClientContext,
  ): Promise<AuthSession> {
    const identity = await this.auth.findGoogleIdentity(googleProfile.sub);
    const sameEmail =
      identity || googleProfile.email === ''
        ? null
        : await this.users.findByEmail(googleProfile.email);
    const decision = resolveGoogleLogin(identity, sameEmail, googleProfile);

    let user: UserAccount;
    switch (decision.kind) {
      case 'rejected':
        throw new GoogleEmailNotVerifiedError();
      case 'sign_in':
        user = await this.users.getById(decision.userId);
        break;
      case 'link':
        await this.auth.createGoogleIdentity({
          userId: decision.userId,
          providerUserId: googleProfile.sub,
          email: googleProfile.email,
        });
        if (decision.markEmailVerified) {
          await this.users.markEmailVerified(decision.userId);
        }
        if (decision.clearPassword) {
          await this.users.clearPassword(decision.userId);
        }
        if (decision.revokeRefreshTokens) {
          await this.auth.revokeAllForUser(decision.userId);
        }
        this.logger.log({
          msg: 'auth.google.linked',
          userId: decision.userId,
          passwordCleared: decision.clearPassword,
          sessionsRevoked: decision.revokeRefreshTokens,
          ip: client.ip,
        });
        user = await this.users.getById(decision.userId);
        break;
      case 'create_user':
        user = await this.users.create({
          email: decision.email,
          name: decision.name,
          passwordHash: null,
          emailVerified: true,
        });
        await this.auth.createGoogleIdentity({
          userId: user.id,
          providerUserId: googleProfile.sub,
          email: googleProfile.email,
        });
        break;
    }
    return this.sessions.start(user, client);
  }
}
