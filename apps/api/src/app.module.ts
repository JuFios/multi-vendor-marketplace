import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AppClsModule } from './common/cls';
import { AllExceptionsFilter } from './common/filters';
import { ThrottlingModule } from './common/throttling';
import { AppConfigModule } from './config';
import { HealthModule } from './health/health.module';
import { LoggerModule } from './logger';
import { MetricsModule } from './metrics';
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
    RedisModule,
    MeiliModule,
    ThrottlingModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
