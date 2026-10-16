import { Global, Module } from '@nestjs/common';
import { Meilisearch } from 'meilisearch';

import { APP_CONFIG, type AppConfig } from '../../config/app-config';

import { MEILI_CLIENT } from './meili.constants';

@Global()
@Module({
  providers: [
    {
      provide: MEILI_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Meilisearch =>
        new Meilisearch({ host: config.meili.host, apiKey: config.meili.masterKey }),
    },
  ],
  exports: [MEILI_CLIENT],
})
export class MeiliModule {}
