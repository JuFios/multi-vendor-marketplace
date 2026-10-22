import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma/transaction';

export interface NewPaymentRefund {
  readonly refundKey: string;
  readonly sellerOrderId: string;
  readonly amountCents: number;
  readonly status: 'REFUNDED' | 'FAILED';
  readonly providerRef: string | null;
  readonly failureReason: string | null;
}

/** Owns `payment_refunds`; one row per refund request, keyed by the request's event id. */
@Injectable()
export class PaymentRefundsRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async create(refund: NewPaymentRefund): Promise<void> {
    await this.txHost.tx.paymentRefund.create({ data: refund });
  }
}
