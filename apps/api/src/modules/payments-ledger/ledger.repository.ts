import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma/transaction';

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

/** Owns `ledger_entries`; rows are only ever appended. */
@Injectable()
export class LedgerRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async append(entries: readonly NewLedgerEntry[]): Promise<void> {
    await this.txHost.tx.ledgerEntry.createMany({ data: [...entries] });
  }
}
