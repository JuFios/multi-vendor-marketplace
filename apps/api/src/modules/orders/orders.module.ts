import { Module } from '@nestjs/common';

import { CartModule } from '../cart';
import { PaymentsLedgerModule } from '../payments-ledger';
import { ProductsModule } from '../products';
import { SellersModule } from '../sellers';

import { AdminOrdersController } from './admin-orders.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { SellerOrdersController } from './seller-orders.controller';

@Module({
  imports: [CartModule, ProductsModule, PaymentsLedgerModule, SellersModule],
  controllers: [OrdersController, SellerOrdersController, AdminOrdersController],
  providers: [OrdersRepository, OrdersService, CheckoutService],
})
export class OrdersModule {}
