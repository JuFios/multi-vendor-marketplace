import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { CacheModule } from './cache';
import { AppClsModule } from './common/cls';
import { AllExceptionsFilter } from './common/filters';
import { ThrottlingModule } from './common/throttling';
import { AppConfigModule } from './config';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency';
import { LoggerModule } from './logger';
import { MetricsModule } from './metrics';
import { AuthModule } from './modules/auth';
import { CartModule } from './modules/cart';
import { CategoriesModule } from './modules/categories';
import { NotificationsModule } from './modules/notifications';
import { OrdersModule } from './modules/orders';
import { PaymentsLedgerModule } from './modules/payments-ledger';
import { ProductsModule } from './modules/products';
import { SearchSyncModule } from './modules/search-sync';
import { SellersModule } from './modules/sellers';
import { UsersModule } from './modules/users';
import { OutboxModule } from './outbox';
import { PrismaModule } from './prisma';
import { RedisModule } from './redis';
import { MeiliModule } from './search';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MetricsModule,
    PrismaModule,
    AppClsModule,
    OutboxModule,
    CacheModule,
    IdempotencyModule,
    RedisModule,
    MeiliModule,
    // AuthModule precedes ThrottlingModule so its guard runs first and per-user limits see `request.user`.
    AuthModule,
    ThrottlingModule,
    HealthModule,
    UsersModule,
    SellersModule,
    CategoriesModule,
    ProductsModule,
    SearchSyncModule,
    CartModule,
    PaymentsLedgerModule,
    OrdersModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
