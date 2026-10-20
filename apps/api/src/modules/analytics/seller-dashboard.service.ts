import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { analyticsConfig } from '../../config/analytics.config';
import { AuctionsService } from '../bidding/auctions.service';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';

import { AnalyticsService } from './analytics.service';
import type { SellerDashboardDto } from './dto/seller-dashboard.dto';
import { SalesDailyRepository } from './sales-daily.repository';
import { revenueOf } from './sales-summary';

const RECENT_ORDERS = 5;
const ACTIVE_LOTS = 20;

/** The store's own figures; every read is limited to the given store. */
@Injectable()
export class SellerDashboardService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly daily: SalesDailyRepository,
    private readonly orders: OrdersService,
    private readonly auctions: AuctionsService,
    private readonly products: ProductsService,
    @Inject(analyticsConfig.KEY) private readonly settings: ConfigType<typeof analyticsConfig>,
  ) {}

  async dashboard(
    sellerId: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<SellerDashboardDto> {
    const period = await this.analytics.periodOf(from, to);
    const [totals, ordersByStatus, recent, lots] = await Promise.all([
      this.daily.totalsBySeller(period, sellerId),
      this.orders.countOfSellerByStatus(sellerId, period, this.settings.timeZone),
      this.orders.listOfSeller(sellerId, undefined, 1, RECENT_ORDERS),
      this.auctions.listActiveOfSeller(sellerId, ACTIVE_LOTS),
    ]);
    const titles = new Map(
      (await this.products.findByIds(lots.map((lot) => lot.productId))).map((product) => [
        product.id,
        product.title,
      ]),
    );
    const own = totals[0];
    return {
      from: period.from,
      to: period.to,
      revenue: {
        ordersCount: own?.ordersCount ?? 0,
        itemsCount: own?.itemsCount ?? 0,
        grossCents: own?.grossCents ?? 0,
        refundsCents: own?.refundedCents ?? 0,
        commissionCents: own?.commissionCents ?? 0,
        netCents: own === undefined ? 0 : revenueOf(own) - own.commissionCents,
      },
      ordersByStatus,
      recentOrders: recent.items,
      activeLots: lots.map((lot) => ({
        auctionId: lot.id,
        productId: lot.productId,
        title: titles.get(lot.productId) ?? '',
        currentPriceCents: lot.currentPriceCents ?? lot.startPriceCents,
        bidCount: lot.bidCount,
        endsAt: lot.endsAt.toISOString(),
      })),
    };
  }
}
