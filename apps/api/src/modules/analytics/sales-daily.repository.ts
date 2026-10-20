import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma/transaction';

import type { Period } from './report-period';
import type { SalesDelta } from './sales-delta';
import type { DayTotals } from './sales-series';
import type { ProductTotals, SellerTotals } from './sales-summary';

const range = (period: Period): { gte: Date; lte: Date } => ({
  gte: new Date(period.from),
  lte: new Date(period.to),
});

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

  /** Today's calendar day in `timeZone`, by the database clock. */
  async today(timeZone: string): Promise<string> {
    const [row] = await this.txHost.tx.$queryRaw<{ day: string }[]>`
      SELECT to_char((now() AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day`;
    return row?.day ?? '';
  }

  /** Totals of all stores per day; days without a row are left out. */
  async totalsByDay(period: Period): Promise<DayTotals[]> {
    const rows = await this.txHost.tx.salesDailyBySeller.groupBy({
      by: ['day'],
      where: { day: range(period) },
      _sum: { grossCents: true, commissionCents: true, ordersCount: true },
    });
    return rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      grossCents: row._sum.grossCents ?? 0,
      commissionCents: row._sum.commissionCents ?? 0,
      ordersCount: row._sum.ordersCount ?? 0,
    }));
  }

  async totalsBySeller(period: Period, sellerId?: string): Promise<SellerTotals[]> {
    const rows = await this.txHost.tx.salesDailyBySeller.groupBy({
      by: ['sellerId'],
      where: { day: range(period), ...(sellerId === undefined ? {} : { sellerId }) },
      _sum: {
        ordersCount: true,
        itemsCount: true,
        grossCents: true,
        refundedCents: true,
        commissionCents: true,
      },
    });
    return rows.map((row) => ({
      sellerId: row.sellerId,
      ordersCount: row._sum.ordersCount ?? 0,
      itemsCount: row._sum.itemsCount ?? 0,
      grossCents: row._sum.grossCents ?? 0,
      refundedCents: row._sum.refundedCents ?? 0,
      commissionCents: row._sum.commissionCents ?? 0,
    }));
  }

  async totalsByProduct(period: Period): Promise<ProductTotals[]> {
    const rows = await this.txHost.tx.salesDailyByProduct.groupBy({
      by: ['productId', 'sellerId'],
      where: { day: range(period) },
      _sum: { quantity: true, grossCents: true, refundedCents: true },
    });
    return rows.map((row) => ({
      productId: row.productId,
      sellerId: row.sellerId,
      quantity: row._sum.quantity ?? 0,
      grossCents: row._sum.grossCents ?? 0,
      refundedCents: row._sum.refundedCents ?? 0,
    }));
  }
}
