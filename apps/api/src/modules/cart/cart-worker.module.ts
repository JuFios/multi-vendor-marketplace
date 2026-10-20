import { Module } from '@nestjs/common';

import { CartModule } from './cart.module';
import { CartProcessor } from './cart.processor';

/** The cart queue consumer; registered in the worker process only. */
@Module({ imports: [CartModule], providers: [CartProcessor] })
export class CartWorkerModule {}
