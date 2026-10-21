import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { Prisma } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';

import { GoogleAuthFailedError } from './auth.errors';
import type { LinkedGoogleIdentity } from './google-login';
import type { StoredRefreshTokenState } from './refresh-token-state';

export interface NewGoogleIdentity {
  readonly userId: string;
  readonly providerUserId: string;
  readonly email: string;
}

export interface NewRefreshTokenRow {
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly ttlDays: number;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export interface CreatedRefreshToken {
  readonly id: string;
  readonly expiresAt: Date;
}

export interface StoredRefreshToken extends StoredRefreshTokenState {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
}

interface LockedRow {
  id: string;
  user_id: string;
  family_id: string;
  revoked_at: Date | null;
  replaced_by_id: string | null;
  expired: boolean;
}

/** Owns `auth_identities` and `refresh_tokens`. */
@Injectable()
export class AuthRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async findGoogleIdentity(providerUserId: string): Promise<LinkedGoogleIdentity | null> {
    const row = await this.txHost.tx.authIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'GOOGLE', providerUserId } },
      select: { userId: true },
    });
    return row && { userId: row.userId };
  }

  /** A concurrent sign-in that linked the same Google account first makes this one fail; retrying works. */
  async createGoogleIdentity(identity: NewGoogleIdentity): Promise<void> {
    try {
      await this.txHost.tx.authIdentity.create({ data: { provider: 'GOOGLE', ...identity } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new GoogleAuthFailedError();
      }
      throw error;
    }
  }

  /** The expiry is computed by the database clock, the same one that later judges it. */
  async createRefreshToken(row: NewRefreshTokenRow): Promise<CreatedRefreshToken> {
    const rows = await this.txHost.tx.$queryRaw<{ id: string; expires_at: Date }[]>`
      INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, user_agent, ip)
      VALUES (
        ${randomUUID()}::uuid, ${row.userId}::uuid, ${row.familyId}::uuid, ${row.tokenHash},
        now() + make_interval(days => ${row.ttlDays}), ${row.userAgent}, ${row.ip}
      )
      RETURNING id, expires_at`;
    const created = rows[0];
    if (!created) {
      throw new Error('refresh token insert returned no row');
    }
    return { id: created.id, expiresAt: created.expires_at };
  }

  /**
   * Row-locks the token until the transaction ends, so two requests presenting the same token
   * run one after the other and the second sees it already rotated.
   */
  async lockRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null> {
    const rows = await this.txHost.tx.$queryRaw<LockedRow[]>`
      SELECT id, user_id, family_id, revoked_at, replaced_by_id, expires_at <= now() AS expired
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
      FOR UPDATE`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          familyId: row.family_id,
          revokedAt: row.revoked_at,
          replacedById: row.replaced_by_id,
          expired: row.expired,
        }
      : null;
  }

  async findFamilyIdByHash(tokenHash: string): Promise<string | null> {
    const row = await this.txHost.tx.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });
    return row?.familyId ?? null;
  }

  async markRotated(id: string, replacedById: string): Promise<void> {
    await this.txHost.tx.$executeRaw`
      UPDATE refresh_tokens
      SET revoked_at = now(), replaced_by_id = ${replacedById}::uuid
      WHERE id = ${id}::uuid`;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.txHost.tx.$executeRaw`
      UPDATE refresh_tokens
      SET revoked_at = now()
      WHERE family_id = ${familyId}::uuid AND revoked_at IS NULL`;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.txHost.tx.$executeRaw`
      UPDATE refresh_tokens
      SET revoked_at = now()
      WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`;
  }
}
