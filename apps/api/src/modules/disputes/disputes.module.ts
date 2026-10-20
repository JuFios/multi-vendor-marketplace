import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';

import { DisputesController } from './disputes.controller';
import { DisputesRepository } from './disputes.repository';
import { DisputesService } from './disputes.service';

@Module({
  imports: [OrdersModule],
  controllers: [DisputesController],
  providers: [DisputesRepository, DisputesService],
})
export class DisputesModule {}
