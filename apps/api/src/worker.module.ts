import { Module } from '@nestjs/common';

import { CacheModule } from './cache/cache.module';
import { AppClsModule } from './common/cls/app-cls.module';
import { AppConfigModule } from './config/config.module';
import { HousekeepingModule } from './housekeeping/housekeeping.module';
import { LoggerModule } from './logger/logger.module';
import { MetricsModule } from './metrics/metrics.module';
import { WorkerMetricsServer } from './metrics/worker-metrics.server';
import { AnalyticsWorkerModule } from './modules/analytics/analytics-worker.module';
import { BiddingWorkerModule } from './modules/bidding/bidding-worker.module';
import { CartWorkerModule } from './modules/cart/cart-worker.module';
import { NotificationsWorkerModule } from './modules/notifications/notifications-worker.module';
import { OrdersWorkerModule } from './modules/orders/orders-worker.module';
import { PaymentsLedgerWorkerModule } from './modules/payments-ledger/payments-ledger-worker.module';
import { ProductsWorkerModule } from './modules/products/products-worker.module';
import { SearchSyncWorkerModule } from './modules/search-sync/search-sync-worker.module';
import { OutboxRelayModule } from './outbox/outbox-relay.module';
import { OutboxModule } from './outbox/outbox.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { MeiliModule } from './search/meili.module';
import { WorkerLifecycle } from './worker.lifecycle';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MetricsModule,
    PrismaModule,
    AppClsModule,
    OutboxModule,
    CacheModule,
    QueueModule,
    OutboxRelayModule,
    HousekeepingModule,
    RedisModule,
    MeiliModule,
    ProductsWorkerModule,
    SearchSyncWorkerModule,
    PaymentsLedgerWorkerModule,
    OrdersWorkerModule,
    NotificationsWorkerModule,
    BiddingWorkerModule,
    CartWorkerModule,
    AnalyticsWorkerModule,
  ],
  providers: [WorkerLifecycle, WorkerMetricsServer],
})
export class WorkerModule {}
