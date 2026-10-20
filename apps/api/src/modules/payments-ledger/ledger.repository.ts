import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { Prisma } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';

import type { TotalsByType } from './finance-summary';

export type LedgerEntryKind =
  'SALE' | 'COMMISSION' | 'REFUND' | 'COMMISSION_REVERSAL' | 'CANCELLATION' | 'PAYOUT';

export interface NewLedgerEntry {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  readonly type: LedgerEntryKind;
  /** Signed from the seller's point of view: money owed to them is positive. */
  readonly amountCents: number;
  /** The refund or payout the entry belongs to. */
  readonly refId?: string;
}

export interface LedgerEntryRecord {
  readonly id: string;
  readonly sellerOrderId: string;
  readonly sellerId: string;
  readonly type: LedgerEntryKind;
  readonly amountCents: number;
  readonly refId: string | null;
  readonly createdAt: Date;
}

export interface LedgerFilter {
  readonly sellerId?: string;
  readonly from?: Date;
  readonly to?: Date;
}

const whereOf = (filter: LedgerFilter): Prisma.LedgerEntryWhereInput => ({
  ...(filter.sellerId === undefined ? {} : { sellerId: filter.sellerId }),
  ...(filter.from === undefined && filter.to === undefined
    ? {}
    : {
        createdAt: {
          ...(filter.from === undefined ? {} : { gte: filter.from }),
          ...(filter.to === undefined ? {} : { lte: filter.to }),
        },
      }),
});

/** Owns `ledger_entries`; rows are only ever appended. */
@Injectable()
export class LedgerRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async append(entries: readonly NewLedgerEntry[]): Promise<void> {
    await this.txHost.tx.ledgerEntry.createMany({ data: [...entries] });
  }

  async totalsByType(filter: LedgerFilter): Promise<TotalsByType> {
    const rows = await this.txHost.tx.ledgerEntry.groupBy({
      by: ['type'],
      where: whereOf(filter),
      _sum: { amountCents: true },
    });
    return Object.fromEntries(rows.map((row) => [row.type, row._sum.amountCents ?? 0]));
  }

  async balanceOf(sellerId: string): Promise<number> {
    const total = await this.txHost.tx.ledgerEntry.aggregate({
      where: { sellerId },
      _sum: { amountCents: true },
    });
    return total._sum.amountCents ?? 0;
  }

  async list(
    filter: LedgerFilter,
    page: number,
    limit: number,
  ): Promise<{ items: LedgerEntryRecord[]; total: number }> {
    const where = whereOf(filter);
    const [items, total] = await Promise.all([
      this.txHost.tx.ledgerEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.txHost.tx.ledgerEntry.count({ where }),
    ]);
    return { items, total };
  }
}
