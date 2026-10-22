import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';

import { ConflictError } from '../common/exceptions/app-error';
import { idempotencyConfig } from '../config/idempotency.config';
import { IdempotencyStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AppTransactionHost } from '../prisma/transaction';

import type { IdempotencyContext, IdempotencyLease } from './idempotency-context';
import {
  IDEMPOTENCY_ERROR_CODE,
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  IdempotencyOutsideTransactionError,
} from './idempotency.errors';

import './idempotency-context';

export interface AcquireRequest {
  userId: string;
  scope: string;
  key: string;
  requestHash: string;
}

export type AcquireResult =
  | { kind: 'acquired'; lease: IdempotencyLease }
  | { kind: 'replay'; statusCode: number; body: unknown };

interface KeyRow {
  id: string;
  request_hash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  response_code: number | null;
  response_body: unknown;
  stale: boolean;
  expired: boolean;
}

const MAX_ACQUIRE_ATTEMPTS = 3;

function toJson(body: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return body === undefined
    ? Prisma.DbNull
    : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue);
}

/**
 * Makes client operations safe to retry. A key is claimed (IN_PROGRESS) before the work starts,
 * completed in the same transaction as the work, and released if the work fails. All timing uses
 * the database clock.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(idempotencyConfig.KEY) private readonly config: ConfigType<typeof idempotencyConfig>,
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /** Claims the key, or answers with the recorded response of an earlier identical request. */
  async acquire(request: AcquireRequest): Promise<AcquireResult> {
    for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
      const inserted = await this.insert(request);
      if (inserted) {
        return { kind: 'acquired', lease: inserted };
      }
      const existing = await this.find(request);
      if (!existing) {
        continue; // released between the conflict and the lookup: claim it again
      }
      if (existing.expired) {
        await this.prisma.$executeRaw`DELETE FROM idempotency_keys WHERE id = ${existing.id}::uuid`;
        continue;
      }
      if (existing.request_hash !== request.requestHash) {
        throw new IdempotencyKeyReusedError();
      }
      if (existing.status === IdempotencyStatus.COMPLETED) {
        return {
          kind: 'replay',
          statusCode: existing.response_code ?? 200,
          body: existing.response_body ?? undefined,
        };
      }
      if (!existing.stale) {
        throw new IdempotencyInProgressError();
      }
      const lease = await this.takeOver(existing.id);
      if (lease) {
        return { kind: 'acquired', lease };
      }
      throw new IdempotencyInProgressError();
    }
    throw new IdempotencyInProgressError();
  }

  /** Frees a key whose request failed, so a retry runs again; a completed key is untouched. */
  async release(lease: IdempotencyLease): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({
      where: { id: lease.id, status: IdempotencyStatus.IN_PROGRESS, createdAt: lease.createdAt },
    });
  }

  /**
   * Records the response in the current transaction, so the effect and its key commit together.
   * Fails (rolling the operation back) when another request took the key over meanwhile.
   * Does nothing outside an idempotent request.
   */
  async complete(responseBody: unknown): Promise<void> {
    const context = this.cls.get('idempotency');
    if (!context) {
      return;
    }
    if (!this.txHost.isTransactionActive()) {
      throw new IdempotencyOutsideTransactionError();
    }
    await this.record(this.txHost.tx.idempotencyKey, context, responseBody);
  }

  /** Fallback for a use case that did not call `complete`: records outside any transaction. */
  async completeAfterTheFact(context: IdempotencyContext, responseBody: unknown): Promise<void> {
    await this.record(this.prisma.idempotencyKey, context, responseBody);
  }

  private async record(
    table: Pick<PrismaService['idempotencyKey'], 'updateMany'>,
    context: IdempotencyContext,
    responseBody: unknown,
  ): Promise<void> {
    const { count } = await table.updateMany({
      where: {
        id: context.lease.id,
        status: IdempotencyStatus.IN_PROGRESS,
        createdAt: context.lease.createdAt,
      },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseCode: context.statusCode,
        responseBody: toJson(responseBody),
      },
    });
    if (count === 0) {
      throw new ConflictError(
        'The Idempotency-Key was taken over by another request',
        IDEMPOTENCY_ERROR_CODE.IN_PROGRESS,
      );
    }
    context.completed = true;
  }

  private async insert(request: AcquireRequest): Promise<IdempotencyLease | undefined> {
    const { ttlHours } = this.config;
    const rows = await this.prisma.$queryRaw<{ id: string; created_at: Date }[]>`
      INSERT INTO idempotency_keys (id, user_id, scope, key, request_hash, status, created_at, expires_at)
      VALUES (${randomUUID()}::uuid, ${request.userId}::uuid, ${request.scope}, ${request.key},
              ${request.requestHash}, 'IN_PROGRESS', now(), now() + make_interval(hours => ${ttlHours}))
      ON CONFLICT (user_id, scope, key) DO NOTHING
      RETURNING id, created_at`;
    const row = rows[0];
    return row ? { id: row.id, createdAt: row.created_at } : undefined;
  }

  private async find(request: AcquireRequest): Promise<KeyRow | undefined> {
    const { lockTimeoutSec } = this.config;
    const rows = await this.prisma.$queryRaw<KeyRow[]>`
      SELECT id, request_hash, status::text AS status, response_code, response_body,
             created_at < now() - make_interval(secs => ${lockTimeoutSec}) AS stale,
             expires_at < now() AS expired
      FROM idempotency_keys
      WHERE user_id = ${request.userId}::uuid AND scope = ${request.scope} AND key = ${request.key}`;
    return rows[0];
  }

  /**
   * Atomic: of several requests racing for an abandoned key, exactly one gets the lease. The key
   * starts a full lifetime again, so it cannot expire (and be deleted) while the new owner works.
   */
  private async takeOver(id: string): Promise<IdempotencyLease | undefined> {
    const { ttlHours, lockTimeoutSec } = this.config;
    const rows = await this.prisma.$queryRaw<{ created_at: Date }[]>`
      UPDATE idempotency_keys
      SET created_at = now(), expires_at = now() + make_interval(hours => ${ttlHours})
      WHERE id = ${id}::uuid AND status = 'IN_PROGRESS'
        AND created_at < now() - make_interval(secs => ${lockTimeoutSec})
      RETURNING created_at`;
    const row = rows[0];
    return row ? { id, createdAt: row.created_at } : undefined;
  }
}
