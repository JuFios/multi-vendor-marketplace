import { Module } from '@nestjs/common';

import { IdempotencyModule } from '../../idempotency';
import { CartModule } from '../cart';
import { PaymentsLedgerModule } from '../payments-ledger';
import { ProductsModule } from '../products';
import { SellersModule } from '../sellers';

import { AdminOrdersController } from './admin-orders.controller';
import { AdminSellerOrdersController } from './admin-seller-orders.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { PaymentSagaService } from './payment-saga.service';
import { SellerOrderLifecycleService } from './seller-order-lifecycle.service';
import { SellerOrdersController } from './seller-orders.controller';

@Module({
  imports: [IdempotencyModule, CartModule, ProductsModule, PaymentsLedgerModule, SellersModule],
  controllers: [
    OrdersController,
    SellerOrdersController,
    AdminOrdersController,
    AdminSellerOrdersController,
  ],
  providers: [
    OrdersRepository,
    OrdersService,
    CheckoutService,
    SellerOrderLifecycleService,
    PaymentSagaService,
  ],
  exports: [PaymentSagaService],
})
export class OrdersModule {}
