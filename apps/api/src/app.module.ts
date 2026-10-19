import { Module } from '@nestjs/common';

import { AppClsModule } from './common/cls';
import { AppConfigModule } from './config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma';
import { RedisModule } from './redis';
import { MeiliModule } from './search';

@Module({
  imports: [AppConfigModule, PrismaModule, AppClsModule, RedisModule, MeiliModule, HealthModule],
})
export class AppModule {}
