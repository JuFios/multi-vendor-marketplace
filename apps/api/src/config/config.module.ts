import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { analyticsConfig } from './analytics.config';
import { appConfig } from './app.config';
import { authConfig } from './auth.config';
import { biddingConfig } from './bidding.config';
import { databaseConfig } from './database.config';
import { resolveEnvFilePaths } from './env-files';
import { validate } from './env.validation';
import { httpConfig } from './http.config';
import { idempotencyConfig } from './idempotency.config';
import { metricsConfig } from './metrics.config';
import { ordersConfig } from './orders.config';
import { outboxConfig } from './outbox.config';
import { paymentsConfig } from './payments.config';
import { productsConfig } from './products.config';
import { queueConfig } from './queue.config';
import { realtimeConfig } from './realtime.config';
import { redisConfig } from './redis.config';
import { searchConfig } from './search.config';
import { throttleConfig } from './throttle.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
      load: [
        analyticsConfig,
        appConfig,
        authConfig,
        biddingConfig,
        databaseConfig,
        httpConfig,
        idempotencyConfig,
        metricsConfig,
        outboxConfig,
        ordersConfig,
        paymentsConfig,
        productsConfig,
        queueConfig,
        realtimeConfig,
        redisConfig,
        searchConfig,
        throttleConfig,
      ],
      validate,
    }),
  ],
})
export class AppConfigModule {}
