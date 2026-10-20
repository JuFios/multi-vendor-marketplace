import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma/transaction';

/** Owns `payouts`; one row per seller order. */
@Injectable()
export class PayoutsRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /** Creates the paid payout; null when the seller order already has one. */
  async createPaid(
    sellerOrderId: string,
    sellerId: string,
    amountCents: number,
  ): Promise<string | null> {
    const created = await this.txHost.tx.payout.createManyAndReturn({
      data: [{ sellerOrderId, sellerId, amountCents, status: 'PAID', paidAt: new Date() }],
      skipDuplicates: true,
      select: { id: true },
    });
    return created[0]?.id ?? null;
  }
}
