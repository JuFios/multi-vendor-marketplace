import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma';

export interface NewPaymentAttempt {
  readonly sellerOrderId: string;
  readonly amountCents: number;
  readonly status: 'CAPTURED' | 'FAILED';
  readonly providerRef: string | null;
  readonly failureReason: string | null;
}

/** Owns `payment_attempts`; at most one row per seller order. */
@Injectable()
export class PaymentAttemptsRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async create(attempt: NewPaymentAttempt): Promise<string> {
    const row = await this.txHost.tx.paymentAttempt.create({
      data: attempt,
      select: { id: true },
    });
    return row.id;
  }
}
