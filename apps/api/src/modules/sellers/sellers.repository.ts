import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { Prisma, type SellerProfile } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma';

import type { ModerationDecision } from './moderation';
import type { ApplicationInput, SellerApplication, SellerStatus } from './seller-application';

const UNIQUE_VIOLATION = 'P2002';
const STORE_NAME_INDEX = 'seller_profiles_store_name_key';

interface DriverUniqueViolationMeta {
  readonly driverAdapterError?: { readonly cause?: { readonly constraint?: { index?: string } } };
}

/** Which unique rule an insert or update broke, or null when the error is something else. */
export function uniqueViolationOf(error: unknown): 'store_name' | 'user' | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== UNIQUE_VIOLATION) {
    return null;
  }
  const meta = error.meta as DriverUniqueViolationMeta | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index === STORE_NAME_INDEX
    ? 'store_name'
    : 'user';
}

export interface ApplicationFilter {
  readonly status?: SellerStatus | undefined;
  readonly page: number;
  readonly limit: number;
}

const toApplication = (row: SellerProfile): SellerApplication => ({
  id: row.id,
  userId: row.userId,
  storeName: row.storeName,
  description: row.description,
  status: row.status,
  rejectionReason: row.rejectionReason,
  moderatedAt: row.moderatedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

@Injectable()
export class SellersRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async findById(id: string): Promise<SellerApplication | null> {
    const row = await this.txHost.tx.sellerProfile.findUnique({ where: { id } });
    return row && toApplication(row);
  }

  async findByUserId(userId: string): Promise<SellerApplication | null> {
    const row = await this.txHost.tx.sellerProfile.findUnique({ where: { userId } });
    return row && toApplication(row);
  }

  async create(userId: string, input: ApplicationInput): Promise<SellerApplication> {
    const row = await this.txHost.tx.sellerProfile.create({ data: { userId, ...input } });
    return toApplication(row);
  }

  /** Moves a rejected application back to PENDING; null when it is no longer rejected. */
  async resubmit(id: string, input: ApplicationInput): Promise<SellerApplication | null> {
    const { count } = await this.txHost.tx.sellerProfile.updateMany({
      where: { id, status: 'REJECTED' },
      data: {
        ...input,
        status: 'PENDING',
        rejectionReason: null,
        moderatedById: null,
        moderatedAt: null,
      },
    });
    return count === 0 ? null : this.findById(id);
  }

  /** Oldest first: the moderation queue is worked through in submission order. */
  async list(filter: ApplicationFilter): Promise<{ items: SellerApplication[]; total: number }> {
    const where = filter.status === undefined ? {} : { status: filter.status };
    const [rows, total] = await Promise.all([
      this.txHost.tx.sellerProfile.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.txHost.tx.sellerProfile.count({ where }),
    ]);
    return { items: rows.map(toApplication), total };
  }

  /** Decides a PENDING application; null when it does not exist or was already decided. */
  async decide(
    id: string,
    adminId: string,
    decision: ModerationDecision,
  ): Promise<SellerApplication | null> {
    const { count } = await this.txHost.tx.sellerProfile.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: decision.status,
        rejectionReason: decision.status === 'REJECTED' ? decision.reason : null,
        moderatedById: adminId,
        moderatedAt: new Date(),
      },
    });
    return count === 0 ? null : this.findById(id);
  }

  /** Store names of the approved stores among `ids`, by store id. */
  async findApprovedNames(ids: readonly string[]): Promise<Map<string, string>> {
    const rows = await this.txHost.tx.sellerProfile.findMany({
      where: { id: { in: [...ids] }, status: 'APPROVED' },
      select: { id: true, storeName: true },
    });
    return new Map(rows.map((row) => [row.id, row.storeName]));
  }
}
