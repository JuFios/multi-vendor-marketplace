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

export interface PaymentRefundRecord extends NewPaymentRefund {
  readonly id: string;
  readonly orderId: string;
  readonly sellerId: string;
  readonly createdAt: Date;
}

/** Owns `payment_refunds`; one row per refund request, keyed by the request's event id. */
@Injectable()
export class PaymentRefundsRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async create(refund: NewPaymentRefund): Promise<void> {
    await this.txHost.tx.paymentRefund.create({ data: refund });
  }

  async existsByRefundKey(refundKey: string): Promise<boolean> {
    const row = await this.txHost.tx.paymentRefund.findUnique({
      where: { refundKey },
      select: { id: true },
    });
    return row !== null;
  }

  /** Newest first, optionally of one outcome, with the order and store they belong to. */
  async list(
    filter: { status?: NewPaymentRefund['status'] },
    page: number,
    limit: number,
  ): Promise<{ items: PaymentRefundRecord[]; total: number }> {
    const where = filter.status === undefined ? {} : { status: filter.status };
    const [rows, total] = await Promise.all([
      this.txHost.tx.paymentRefund.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { sellerOrder: { select: { orderId: true, sellerId: true } } },
      }),
      this.txHost.tx.paymentRefund.count({ where }),
    ]);
    return {
      items: rows.map(({ sellerOrder, ...row }) => ({ ...row, ...sellerOrder })),
      total,
    };
  }
}
