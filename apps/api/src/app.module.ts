import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { CacheModule } from './cache/cache.module';
import { AppClsModule } from './common/cls/app-cls.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ThrottlingModule } from './common/throttling/throttling.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { LoggerModule } from './logger/logger.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BiddingModule } from './modules/bidding/bidding.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsLedgerModule } from './modules/payments-ledger/payments-ledger.module';
import { ProductsModule } from './modules/products/products.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SearchSyncModule } from './modules/search-sync/search-sync.module';
import { SellersModule } from './modules/sellers/sellers.module';
import { UsersModule } from './modules/users/users.module';
import { OutboxModule } from './outbox/outbox.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MeiliModule } from './search/meili.module';

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
    BiddingModule,
    SearchSyncModule,
    CartModule,
    PaymentsLedgerModule,
    OrdersModule,
    NotificationsModule,
    ReviewsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
