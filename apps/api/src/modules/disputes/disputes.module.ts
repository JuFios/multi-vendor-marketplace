import { Module } from '@nestjs/common';

import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { OrdersModule } from '../orders/orders.module';

import { AdminDisputesController } from './admin-disputes.controller';
import { DisputesController } from './disputes.controller';
import { DisputesRepository } from './disputes.repository';
import { DisputesService } from './disputes.service';

@Module({
  imports: [IdempotencyModule, OrdersModule],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesRepository, DisputesService],
})
export class DisputesModule {}
