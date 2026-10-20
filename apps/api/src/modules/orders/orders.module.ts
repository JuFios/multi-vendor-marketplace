import { Module } from '@nestjs/common';

import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { BiddingModule } from '../bidding/bidding.module';
import { CartModule } from '../cart/cart.module';
import { PaymentsLedgerModule } from '../payments-ledger/payments-ledger.module';
import { ProductsModule } from '../products/products.module';
import { SellersModule } from '../sellers/sellers.module';

import { AdminOrdersController } from './admin-orders.controller';
import { AdminSellerOrdersController } from './admin-seller-orders.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { PaymentSagaService } from './payment-saga.service';
import { RefundService } from './refund.service';
import { SellerOrderLifecycleService } from './seller-order-lifecycle.service';
import { SellerOrdersController } from './seller-orders.controller';

@Module({
  imports: [
    IdempotencyModule,
    BiddingModule,
    CartModule,
    ProductsModule,
    PaymentsLedgerModule,
    SellersModule,
  ],
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
    RefundService,
  ],
  exports: [PaymentSagaService, RefundService],
})
export class OrdersModule {}
