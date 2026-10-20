import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { ValidationFailedError } from '../../common/exceptions/app-error';
import { analyticsConfig } from '../../config/analytics.config';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { SellersService } from '../sellers/sellers.service';

import type {
  AnalyticsReportDto,
  AnalyticsSummaryDto,
  ProductSalesDto,
  SalesChartDto,
  StoreSalesDto,
} from './dto/analytics-response.dto';
import { REPORT_SCHEMA_VERSION } from './report-csv';
import {
  comparisonPeriods,
  isRealDay,
  lengthOf,
  MAX_PERIOD_DAYS,
  type Period,
  resolvePeriod,
} from './report-period';
import { SalesDailyRepository } from './sales-daily.repository';
import { deltasOf, fillSeries, totalsOf } from './sales-series';
import {
  conversionRate,
  type ProductTotals,
  rankProducts,
  rankSellers,
  revenueOf,
  type SellerTotals,
} from './sales-summary';

const UNKNOWN_STORE = 'Unknown store';

/** Admin reads over the daily sales read models. */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly daily: SalesDailyRepository,
    private readonly carts: CartService,
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
    @Inject(analyticsConfig.KEY) private readonly settings: ConfigType<typeof analyticsConfig>,
  ) {}

  /** The period asked for, or the last 30 days; days are in the analytics time zone. */
  async periodOf(from: string | undefined, to: string | undefined): Promise<Period> {
    for (const [field, value] of [
      ['from', from],
      ['to', to],
    ] as const) {
      if (value !== undefined && !isRealDay(value)) {
        throw new ValidationFailedError([{ field, message: `${field} is not a calendar day` }]);
      }
    }
    const period = resolvePeriod(from, to, await this.daily.today(this.settings.timeZone));
    if (period.from > period.to) {
      throw new ValidationFailedError([
        { field: 'from', message: '`from` must not be after `to`' },
      ]);
    }
    if (lengthOf(period) > MAX_PERIOD_DAYS) {
      throw new ValidationFailedError([
        { field: 'from', message: `The period is at most ${MAX_PERIOD_DAYS} days` },
      ]);
    }
    return period;
  }

  async summary(from: string | undefined, to: string | undefined): Promise<AnalyticsSummaryDto> {
    const period = await this.periodOf(from, to);
    return (await this.compile(period, false)).summary;
  }

  /** The summary with the sales of every product and of every day of the period (I-22). */
  async report(from: string | undefined, to: string | undefined): Promise<AnalyticsReportDto> {
    const period = await this.periodOf(from, to);
    const [{ summary, products }, days] = await Promise.all([
      this.compile(period, true),
      this.daily.totalsByDay(period),
    ]);
    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      timeZone: this.settings.timeZone,
      summary,
      daily: fillSeries(period, days),
      products,
    };
  }

  private async compile(
    period: Period,
    allProducts: boolean,
  ): Promise<{ summary: AnalyticsSummaryDto; products: ProductSalesDto[] }> {
    const [sellerTotals, productTotals, carts] = await Promise.all([
      this.daily.totalsBySeller(period),
      this.daily.totalsByProduct(period),
      this.carts.conversionStats(period, this.settings.timeZone),
    ]);
    const standing = sellerTotals.filter(
      (row) => row.ordersCount !== 0 || row.grossCents !== 0 || row.refundedCents !== 0,
    );
    const topProducts = rankProducts(productTotals);
    const listed = allProducts ? rankProducts(productTotals, Infinity) : topProducts;
    const [names, titles] = await Promise.all([
      this.sellers.findStoreNames(standing.map((row) => row.sellerId)),
      this.titlesOf(listed),
    ]);
    const toProduct = (row: ProductTotals): ProductSalesDto => ({
      productId: row.productId,
      title: titles.get(row.productId) ?? '',
      sellerId: row.sellerId,
      quantity: row.quantity,
      grossCents: row.grossCents,
      refundedCents: row.refundedCents,
      revenueCents: revenueOf(row),
    });
    const toStore = (row: SellerTotals): StoreSalesDto => ({
      sellerId: row.sellerId,
      storeName: names.get(row.sellerId) ?? UNKNOWN_STORE,
      ordersCount: row.ordersCount,
      itemsCount: row.itemsCount,
      grossCents: row.grossCents,
      refundedCents: row.refundedCents,
      revenueCents: revenueOf(row),
      commissionCents: row.commissionCents,
      netCents: revenueOf(row) - row.commissionCents,
    });
    const summary: AnalyticsSummaryDto = {
      from: period.from,
      to: period.to,
      platformRevenueCents: sum(sellerTotals, (row) => row.commissionCents),
      grossSalesCents: sum(sellerTotals, (row) => row.grossCents),
      refundsCents: sum(sellerTotals, (row) => row.refundedCents),
      ordersCount: sum(sellerTotals, (row) => row.ordersCount),
      revenueBySeller: [...standing]
        .sort((a, b) => revenueOf(b) - revenueOf(a) || a.sellerId.localeCompare(b.sellerId))
        .map(toStore),
      topProducts: topProducts.map(toProduct),
      topSellers: rankSellers(sellerTotals).map(toStore),
      conversion: {
        ...carts,
        rate: conversionRate(carts.cartsWithItems, carts.convertedCarts),
      },
    };
    return { summary, products: allProducts ? listed.map(toProduct) : [] };
  }

  async salesChart(days: number): Promise<SalesChartDto> {
    const today = await this.daily.today(this.settings.timeZone);
    const periods = comparisonPeriods(days, today);
    const [current, previous] = await Promise.all([
      this.daily.totalsByDay(periods.current),
      this.daily.totalsByDay(periods.previous),
    ]);
    const currentSeries = fillSeries(periods.current, current);
    const previousSeries = fillSeries(periods.previous, previous);
    const totals = { current: totalsOf(currentSeries), previous: totalsOf(previousSeries) };
    return {
      current: currentSeries,
      previous: previousSeries,
      totals: { ...totals, deltaPct: deltasOf(totals.current, totals.previous) },
    };
  }

  private async titlesOf(rows: readonly ProductTotals[]): Promise<Map<string, string>> {
    const found = await this.products.findByIds(rows.map((row) => row.productId));
    return new Map(found.map((product) => [product.id, product.title]));
  }
}

function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}
