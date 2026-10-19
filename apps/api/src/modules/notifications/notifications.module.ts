import { Module } from '@nestjs/common';

import { SellersModule } from '../sellers';

import { NoopRealtimePublisher } from './noop-realtime-publisher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { REALTIME_PUBLISHER } from './realtime-publisher.port';

@Module({
  imports: [SellersModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    { provide: REALTIME_PUBLISHER, useClass: NoopRealtimePublisher },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
