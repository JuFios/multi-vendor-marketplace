import { Module } from '@nestjs/common';

import { SearchBootstrap } from './search-bootstrap.service';
import { SearchIndexModule } from './search-index.module';
import { SearchRedrive } from './search-redrive.service';
import { SearchSyncProcessor } from './search-sync.processor';

/** The search-sync queue consumer; registered in the worker process only. */
@Module({
  imports: [SearchIndexModule],
  providers: [SearchSyncProcessor, SearchBootstrap, SearchRedrive],
})
export class SearchSyncWorkerModule {}
