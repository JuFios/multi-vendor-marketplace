import { Injectable } from '@nestjs/common';

import { LedgerRepository, type NewLedgerEntry } from './ledger.repository';

export interface SaleRecord {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  readonly subtotalCents: number;
  readonly commissionCents: number;
}

export interface CancellationRecord {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  /** Subtotal not yet refunded: what the sale entry still stands for. */
  readonly releasedCents: number;
  readonly commissionCents: number;
}

export interface RefundRecord {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  readonly refunds: readonly { readonly refundId: string; readonly amountCents: number }[];
  /** The part of the commission the refunded amount no longer owes. */
  readonly commissionReversalCents: number;
}

@Injectable()
export class LedgerService {
  constructor(private readonly ledger: LedgerRepository) {}

  /**
   * Books a seller order: the sale in the seller's favour and the platform's commission as its
   * own row. Joins the caller's transaction, so the order and its books commit together.
   */
  recordSale(sale: SaleRecord): Promise<void> {
    return this.ledger.append([
      {
        sellerOrderId: sale.sellerOrderId,
        sellerId: sale.sellerId,
        type: 'SALE',
        amountCents: sale.subtotalCents,
      },
      {
        sellerOrderId: sale.sellerOrderId,
        sellerId: sale.sellerId,
        type: 'COMMISSION',
        amountCents: -sale.commissionCents,
      },
    ]);
  }

  /** Books refunded items against the seller, and the commission given back on them. */
  recordRefund(refund: RefundRecord): Promise<void> {
    const entries: NewLedgerEntry[] = refund.refunds.map((line) => ({
      sellerOrderId: refund.sellerOrderId,
      sellerId: refund.sellerId,
      type: 'REFUND',
      amountCents: -line.amountCents,
      refId: line.refundId,
    }));
    const first = refund.refunds[0];
    if (refund.commissionReversalCents > 0 && first !== undefined) {
      entries.push({
        sellerOrderId: refund.sellerOrderId,
        sellerId: refund.sellerId,
        type: 'COMMISSION_REVERSAL',
        amountCents: refund.commissionReversalCents,
        refId: first.refundId,
      });
    }
    return this.ledger.append(entries);
  }

  /**
   * Reverses what is still booked for a cancelled seller order: the unrefunded sale and the
   * whole commission, so the seller order nets to zero.
   */
  recordCancellation(cancellation: CancellationRecord): Promise<void> {
    const entries: NewLedgerEntry[] = [
      {
        sellerOrderId: cancellation.sellerOrderId,
        sellerId: cancellation.sellerId,
        type: 'CANCELLATION',
        amountCents: -cancellation.releasedCents,
      },
    ];
    if (cancellation.commissionCents > 0) {
      entries.push({
        sellerOrderId: cancellation.sellerOrderId,
        sellerId: cancellation.sellerId,
        type: 'COMMISSION_REVERSAL',
        amountCents: cancellation.commissionCents,
      });
    }
    return this.ledger.append(entries);
  }
}
