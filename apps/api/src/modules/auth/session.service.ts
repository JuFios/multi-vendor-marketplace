import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';

import { authConfig } from '../../config';
import type { AppTransactionHost } from '../../prisma';
import { SellersService } from '../sellers/sellers.service';
import type { UserAccount } from '../users/user-account';
import { UsersService } from '../users/users.service';

import { AccessTokenService } from './access-token.service';
import { InvalidRefreshTokenError, RefreshTokenReusedError } from './auth.errors';
import { AuthRepository } from './auth.repository';
import { hashRefreshToken, newRefreshToken } from './refresh-token';
import { judgeRefreshToken } from './refresh-token-state';

export interface ClientContext {
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly expiresInSec: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly user: UserAccount;
}

const USER_AGENT_MAX_LENGTH = 255;

const toAccount = (user: UserAccount): UserAccount => ({
  id: user.id,
  email: user.email,
  name: user.name,
  roles: user.roles,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
});

type RefreshOutcome =
  | { readonly kind: 'ok'; readonly session: AuthSession }
  | { readonly kind: 'rejected'; readonly error: Error };

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly accessTokens: AccessTokenService,
    private readonly auth: AuthRepository,
    private readonly users: UsersService,
    private readonly sellers: SellersService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  /** Opens a new refresh-token family: one per sign-in, rotated on every refresh. */
  start(user: UserAccount, client: ClientContext): Promise<AuthSession> {
    return this.issue(user, randomUUID(), client);
  }

  /**
   * Exchanges a refresh token for a new one in the same family. Presenting a token that was
   * already rotated or revoked revokes the whole family, and that revocation is committed
   * before the error is raised.
   */
  async refresh(rawToken: string, client: ClientContext): Promise<AuthSession> {
    const outcome = await this.txHost.withTransaction(() => this.rotate(rawToken, client));
    if (outcome.kind === 'rejected') {
      throw outcome.error;
    }
    return outcome.session;
  }

  /** Revokes the family of the presented token; unknown tokens are ignored. */
  async end(rawToken: string): Promise<void> {
    await this.txHost.withTransaction(async () => {
      const familyId = await this.auth.findFamilyIdByHash(hashRefreshToken(rawToken));
      if (familyId !== null) {
        await this.auth.revokeFamily(familyId);
      }
    });
  }

  private async rotate(rawToken: string, client: ClientContext): Promise<RefreshOutcome> {
    const stored = await this.auth.lockRefreshToken(hashRefreshToken(rawToken));
    const verdict = judgeRefreshToken(stored);

    if (stored === null || verdict === 'unknown' || verdict === 'expired') {
      return { kind: 'rejected', error: new InvalidRefreshTokenError() };
    }
    if (verdict === 'reused') {
      await this.auth.revokeFamily(stored.familyId);
      this.logger.warn({
        msg: 'auth.refresh.reuse_detected',
        userId: stored.userId,
        familyId: stored.familyId,
        ip: client.ip,
      });
      return { kind: 'rejected', error: new RefreshTokenReusedError() };
    }

    // Roles and the store id are read again, so an approved seller gets them on the next refresh.
    const user = await this.users.findById(stored.userId);
    if (!user) {
      return { kind: 'rejected', error: new InvalidRefreshTokenError() };
    }
    const session = await this.issue(user, stored.familyId, client, stored.id);
    return { kind: 'ok', session };
  }

  private async issue(
    user: UserAccount,
    familyId: string,
    client: ClientContext,
    rotatedFromId?: string,
  ): Promise<AuthSession> {
    const refresh = newRefreshToken();
    const created = await this.auth.createRefreshToken({
      userId: user.id,
      familyId,
      tokenHash: refresh.tokenHash,
      ttlDays: this.config.refreshTtlDays,
      userAgent: client.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
      ip: client.ip ?? null,
    });
    if (rotatedFromId !== undefined) {
      await this.auth.markRotated(rotatedFromId, created.id);
    }
    const sellerId = user.roles.includes('SELLER')
      ? await this.sellers.findApprovedSellerId(user.id)
      : undefined;
    const { token, expiresInSec } = await this.accessTokens.issue({
      sub: user.id,
      roles: user.roles,
      ...(sellerId === undefined ? {} : { sellerId }),
    });
    return {
      accessToken: token,
      expiresInSec,
      refreshToken: refresh.token,
      refreshExpiresAt: created.expiresAt,
      user: toAccount(user),
    };
  }
}
