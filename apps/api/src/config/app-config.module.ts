import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { APP_CONFIG, buildAppConfig } from './app-config';
import { resolveEnvFilePaths } from './env-files';
import { parseEnv } from './env.schema';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: resolveEnvFilePaths(),
      validate: parseEnv,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): ReturnType<typeof buildAppConfig> => buildAppConfig(parseEnv(process.env)),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
