import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma/transaction';

import type { SalesDelta } from './sales-delta';

/** Owns the `sales_daily_*` read models. */
@Injectable()
export class SalesDailyRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /** Adds the delta to the day's totals; a missing row starts from zero. */
  async apply(delta: SalesDelta): Promise<void> {
    const tx = this.txHost.tx;
    const { seller } = delta;
    await tx.$executeRaw`
      INSERT INTO sales_daily_by_seller
        (day, seller_id, orders_count, items_count, gross_cents, refunded_cents, commission_cents)
      VALUES
        (${delta.day}::date, ${delta.sellerId}::uuid, ${seller.ordersCount}, ${seller.itemsCount},
         ${seller.grossCents}, ${seller.refundedCents}, ${seller.commissionCents})
      ON CONFLICT (day, seller_id) DO UPDATE SET
        orders_count = sales_daily_by_seller.orders_count + EXCLUDED.orders_count,
        items_count = sales_daily_by_seller.items_count + EXCLUDED.items_count,
        gross_cents = sales_daily_by_seller.gross_cents + EXCLUDED.gross_cents,
        refunded_cents = sales_daily_by_seller.refunded_cents + EXCLUDED.refunded_cents,
        commission_cents = sales_daily_by_seller.commission_cents + EXCLUDED.commission_cents`;
    // Products in a fixed order, so concurrent deliveries cannot lock rows crosswise.
    for (const product of delta.products) {
      await tx.$executeRaw`
        INSERT INTO sales_daily_by_product
          (day, product_id, seller_id, quantity, gross_cents, refunded_cents)
        VALUES
          (${delta.day}::date, ${product.productId}::uuid, ${delta.sellerId}::uuid,
           ${product.quantity}, ${product.grossCents}, ${product.refundedCents})
        ON CONFLICT (day, product_id) DO UPDATE SET
          quantity = sales_daily_by_product.quantity + EXCLUDED.quantity,
          gross_cents = sales_daily_by_product.gross_cents + EXCLUDED.gross_cents,
          refunded_cents = sales_daily_by_product.refunded_cents + EXCLUDED.refunded_cents`;
    }
  }
}
