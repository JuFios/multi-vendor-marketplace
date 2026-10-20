import { Module } from '@nestjs/common';

import { CartModule } from '../cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { SellersModule } from '../sellers/sellers.module';

import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SalesDailyRepository } from './sales-daily.repository';
import { SalesProjectionService } from './sales-projection.service';

@Module({
  imports: [CartModule, OrdersModule, ProductsModule, SellersModule],
  controllers: [AdminAnalyticsController],
  providers: [SalesDailyRepository, SalesProjectionService, AnalyticsService],
  exports: [AnalyticsService, SalesProjectionService],
})
export class AnalyticsModule {}
