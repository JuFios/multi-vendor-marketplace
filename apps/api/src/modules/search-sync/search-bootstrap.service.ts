import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { SEARCH_PORT, type SearchPort } from '../../search/search.port';

import { SearchIndexer } from './search-indexer.service';

/** At worker start: sets the index up, and fills it from the database when it is empty. */
@Injectable()
export class SearchBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(SearchBootstrap.name);

  constructor(
    @Inject(SEARCH_PORT) private readonly search: SearchPort,
    private readonly indexer: SearchIndexer,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.search.ensureIndex();
      if ((await this.search.countDocuments()) === 0) {
        await this.indexer.reindexAll({ clear: false });
      }
    } catch (error) {
      // The consumer sets the index up again on its first event, and the catalog falls back to SQL.
      this.logger.warn({
        msg: 'search.bootstrap_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
