import { Module } from '@nestjs/common';

import { CacheModule } from './cache';
import { AppClsModule } from './common/cls';
import { AppConfigModule } from './config';
import { LoggerModule } from './logger';
import { MetricsModule, WorkerMetricsServer } from './metrics';
import { OrdersWorkerModule } from './modules/orders';
import { PaymentsLedgerWorkerModule } from './modules/payments-ledger';
import { ProductsWorkerModule } from './modules/products';
import { SearchSyncWorkerModule } from './modules/search-sync';
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
  ],
  providers: [WorkerLifecycle, WorkerMetricsServer],
})
export class WorkerModule {}
