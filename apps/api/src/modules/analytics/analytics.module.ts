import { Module } from '@nestjs/common';

import { BiddingModule } from '../bidding/bidding.module';
import { CartModule } from '../cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { SellersModule } from '../sellers/sellers.module';

import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SalesDailyRepository } from './sales-daily.repository';
import { SalesProjectionService } from './sales-projection.service';
import { SellerDashboardController } from './seller-dashboard.controller';
import { SellerDashboardService } from './seller-dashboard.service';

@Module({
  imports: [BiddingModule, CartModule, OrdersModule, ProductsModule, SellersModule],
  controllers: [AdminAnalyticsController, SellerDashboardController],
  providers: [
    SalesDailyRepository,
    SalesProjectionService,
    AnalyticsService,
    SellerDashboardService,
  ],
  exports: [AnalyticsService, SalesProjectionService],
})
export class AnalyticsModule {}
