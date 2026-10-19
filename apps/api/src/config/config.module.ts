import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from './app.config';
import { databaseConfig } from './database.config';
import { resolveEnvFilePaths } from './env-files';
import { validate } from './env.validation';
import { httpConfig } from './http.config';
import { metricsConfig } from './metrics.config';
import { redisConfig } from './redis.config';
import { searchConfig } from './search.config';
import { throttleConfig } from './throttle.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
      load: [
        appConfig,
        databaseConfig,
        httpConfig,
        metricsConfig,
        redisConfig,
        searchConfig,
        throttleConfig,
      ],
      validate,
    }),
  ],
})
export class AppConfigModule {}
