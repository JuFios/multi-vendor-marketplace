import { Module } from '@nestjs/common';

import { AppClsModule } from './common/cls';
import { AppConfigModule } from './config';
import { LoggerModule } from './logger';
import { MetricsModule, WorkerMetricsServer } from './metrics';
import { PrismaModule } from './prisma';
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
    RedisModule,
    MeiliModule,
  ],
  providers: [WorkerLifecycle, WorkerMetricsServer],
})
export class WorkerModule {}
