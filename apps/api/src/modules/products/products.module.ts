import { Module } from '@nestjs/common';

import { BiddingModule } from '../bidding/bidding.module';
import { CategoriesModule } from '../categories/categories.module';
import { SellersModule } from '../sellers/sellers.module';

import { AdminProductsController } from './admin-products.controller';
import { InventoryService } from './inventory.service';
import { ProductDetailsCache } from './product-details-cache.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { SellerProductsController } from './seller-products.controller';

@Module({
  imports: [BiddingModule, CategoriesModule, SellersModule],
  controllers: [SellerProductsController, ProductsController, AdminProductsController],
  providers: [ProductsRepository, ProductDetailsCache, ProductsService, InventoryService],
  exports: [ProductsService, InventoryService],
})
export class ProductsModule {}
