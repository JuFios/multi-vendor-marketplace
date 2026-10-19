import { Module } from '@nestjs/common';

import { CartModule } from '../cart';
import { PaymentsLedgerModule } from '../payments-ledger';
import { ProductsModule } from '../products';
import { SellersModule } from '../sellers';

import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';

@Module({
  imports: [CartModule, ProductsModule, PaymentsLedgerModule, SellersModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, CheckoutService],
})
export class OrdersModule {}
