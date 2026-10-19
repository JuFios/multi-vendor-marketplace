import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from './app.config';
import { databaseConfig } from './database.config';
import { resolveEnvFilePaths } from './env-files';
import { validate } from './env.validation';
import { redisConfig } from './redis.config';
import { searchConfig } from './search.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
      load: [appConfig, databaseConfig, redisConfig, searchConfig],
      validate,
    }),
  ],
})
export class AppConfigModule {}
