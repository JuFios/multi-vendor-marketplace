import { Injectable } from '@nestjs/common';

import { LedgerRepository } from './ledger.repository';

export interface SaleRecord {
  readonly sellerOrderId: string;
  readonly sellerId: string;
  readonly subtotalCents: number;
  readonly commissionCents: number;
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
}
