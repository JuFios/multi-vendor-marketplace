import { Global, Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Meilisearch } from 'meilisearch';

import { searchConfig } from '../config';

import { MEILI_CLIENT } from './meili.constants';

@Global()
@Module({
  providers: [
    {
      provide: MEILI_CLIENT,
      inject: [searchConfig.KEY],
      useFactory: (config: ConfigType<typeof searchConfig>): Meilisearch =>
        new Meilisearch({ host: config.host, apiKey: config.masterKey }),
    },
  ],
  exports: [MEILI_CLIENT],
})
export class MeiliModule {}
