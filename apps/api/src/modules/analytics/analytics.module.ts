import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';

import { SalesDailyRepository } from './sales-daily.repository';
import { SalesProjectionService } from './sales-projection.service';

@Module({
  imports: [OrdersModule],
  providers: [SalesDailyRepository, SalesProjectionService],
  exports: [SalesProjectionService],
})
export class AnalyticsModule {}
