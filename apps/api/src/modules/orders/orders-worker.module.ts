import { Module } from '@nestjs/common';

import { OrdersSagaProcessor } from './orders-saga.processor';
import { OrdersModule } from './orders.module';

/** The saga queue consumer; registered in the worker process only. */
@Module({ imports: [OrdersModule], providers: [OrdersSagaProcessor] })
export class OrdersWorkerModule {}
