import { Module } from '@nestjs/common';

import { BiddingModule } from '../bidding/bidding.module';
import { CategoriesModule } from '../categories/categories.module';
import { ProductsModule } from '../products/products.module';
import { SellersModule } from '../sellers/sellers.module';

import { CatalogNamespace } from './catalog-namespace.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** The public catalog: search answered by the index, with a database fallback. */
@Module({
  imports: [ProductsModule, BiddingModule, CategoriesModule, SellersModule],
  controllers: [CatalogController],
  providers: [CatalogNamespace, CatalogService],
})
export class SearchSyncModule {}
