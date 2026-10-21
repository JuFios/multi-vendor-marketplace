import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BiddingModule } from '../bidding/bidding.module';
import { ProductsModule } from '../products/products.module';
import { SellersModule } from '../sellers/sellers.module';

import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { REALTIME_PUBLISHER } from './realtime-publisher.port';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { RedisRealtimePublisher } from './redis-realtime-publisher.service';

@Module({
  imports: [AuthModule, BiddingModule, ProductsModule, SellersModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    RealtimeGateway,
    RealtimeService,
    { provide: REALTIME_PUBLISHER, useClass: RedisRealtimePublisher },
  ],
  exports: [NotificationsService, RealtimeService, REALTIME_PUBLISHER],
})
export class NotificationsModule {}
