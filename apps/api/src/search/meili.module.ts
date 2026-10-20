import { Global, Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Meilisearch } from 'meilisearch';

import { searchConfig } from '../config/search.config';

import { MeiliSearchAdapter } from './meili-search.adapter';
import { MEILI_CLIENT } from './meili.constants';
import { SEARCH_PORT } from './search.port';

@Global()
@Module({
  providers: [
    {
      provide: MEILI_CLIENT,
      inject: [searchConfig.KEY],
      useFactory: (config: ConfigType<typeof searchConfig>): Meilisearch =>
        new Meilisearch({ host: config.host, apiKey: config.masterKey }),
    },
    MeiliSearchAdapter,
    { provide: SEARCH_PORT, useExisting: MeiliSearchAdapter },
  ],
  exports: [MEILI_CLIENT, SEARCH_PORT],
})
export class MeiliModule {}
