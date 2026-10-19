import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories';
import { ProductsModule } from '../products';
import { SellersModule } from '../sellers';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** The public catalog: search answered by the index, with a database fallback. */
@Module({
  imports: [ProductsModule, CategoriesModule, SellersModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class SearchSyncModule {}
