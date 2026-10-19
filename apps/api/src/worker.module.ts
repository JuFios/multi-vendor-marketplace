import { Module } from '@nestjs/common';

import { AppClsModule } from './common/cls';
import { AppConfigModule } from './config';
import { LoggerModule } from './logger';
import { MetricsModule, WorkerMetricsServer } from './metrics';
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
    QueueModule,
    OutboxRelayModule,
    RedisModule,
    MeiliModule,
  ],
  providers: [WorkerLifecycle, WorkerMetricsServer],
})
export class WorkerModule {}
