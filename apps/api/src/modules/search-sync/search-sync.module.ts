import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories';
import { ProductsModule } from '../products';
import { SellersModule } from '../sellers';

import { CatalogNamespace } from './catalog-namespace.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** The public catalog: search answered by the index, with a database fallback. */
@Module({
  imports: [ProductsModule, CategoriesModule, SellersModule],
  controllers: [CatalogController],
  providers: [CatalogNamespace, CatalogService],
})
export class SearchSyncModule {}
