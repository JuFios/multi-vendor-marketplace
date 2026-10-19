import { Module } from '@nestjs/common';

import { AppClsModule } from './common/cls';
import { AppConfigModule } from './config';
import { PrismaModule } from './prisma';
import { RedisModule } from './redis';
import { MeiliModule } from './search';
import { WorkerLifecycle } from './worker.lifecycle';

@Module({
  imports: [AppConfigModule, PrismaModule, AppClsModule, RedisModule, MeiliModule],
  providers: [WorkerLifecycle],
})
export class WorkerModule {}
