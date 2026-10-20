import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { ProductsModule } from '../products/products.module';
import { SellersModule } from '../sellers/sellers.module';

import { CatalogNamespace } from './catalog-namespace.service';
import { SearchIndexer } from './search-indexer.service';

/** Everything that writes the search index; used by the worker and the reindex command. */
@Module({
  imports: [ProductsModule, CategoriesModule, SellersModule],
  providers: [CatalogNamespace, SearchIndexer],
  exports: [SearchIndexer],
})
export class SearchIndexModule {}
