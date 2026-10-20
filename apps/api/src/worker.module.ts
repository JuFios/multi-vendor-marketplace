import { Module } from '@nestjs/common';

import { CacheModule } from './cache';
import { AppClsModule } from './common/cls';
import { AppConfigModule } from './config';
import { LoggerModule } from './logger';
import { MetricsModule, WorkerMetricsServer } from './metrics';
import { NotificationsWorkerModule } from './modules/notifications/notifications-worker.module';
import { OrdersWorkerModule } from './modules/orders/orders-worker.module';
import { PaymentsLedgerWorkerModule } from './modules/payments-ledger/payments-ledger-worker.module';
import { ProductsWorkerModule } from './modules/products/products-worker.module';
import { SearchSyncWorkerModule } from './modules/search-sync/search-sync-worker.module';
import { OutboxModule, OutboxRelayModule } from './outbox';
import { PrismaModule } from './prisma';
import { QueueModule } from './queue';
import { RedisModule } from './redis';
import { MeiliModule } from './search';
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
    RedisModule,
    MeiliModule,
    ProductsWorkerModule,
    SearchSyncWorkerModule,
    PaymentsLedgerWorkerModule,
    OrdersWorkerModule,
    NotificationsWorkerModule,
  ],
  providers: [WorkerLifecycle, WorkerMetricsServer],
})
export class WorkerModule {}
