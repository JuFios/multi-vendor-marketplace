import { Injectable } from '@nestjs/common';

import { SellerOrderNotFoundError } from './orders.errors';
import { OrdersRepository } from './orders.repository';
import { type RefundFacts, type SaleFacts, toRefundFacts, toSaleFacts } from './sales-facts';

/**
 * Read side for analytics: the figures of a seller order or a refund batch, each tied to the
 * calendar day of the order in the caller's time zone. Everything it returns is immutable once
 * the order is cancelled, so replaying events in any order converges on the same totals.
 */
@Injectable()
export class SalesFactsService {
  constructor(private readonly orders: OrdersRepository) {}

  async ofSale(sellerOrderId: string, timeZone: string): Promise<SaleFacts> {
    const source = await this.orders.findSaleSource(sellerOrderId, timeZone);
    if (source === null) {
      throw new SellerOrderNotFoundError();
    }
    return toSaleFacts(source);
  }

  async ofRefunds(
    sellerOrderId: string,
    refundIds: readonly string[],
    timeZone: string,
  ): Promise<RefundFacts> {
    const source = await this.orders.findRefundSource(sellerOrderId, refundIds, timeZone);
    if (source === null) {
      throw new SellerOrderNotFoundError();
    }
    return toRefundFacts(source);
  }
}
