import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories';
import { SellersModule } from '../sellers';

import { AdminProductsController } from './admin-products.controller';
import { InventoryService } from './inventory.service';
import { ProductDetailsCache } from './product-details-cache.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { SellerProductsController } from './seller-products.controller';

@Module({
  imports: [CategoriesModule, SellersModule],
  controllers: [SellerProductsController, ProductsController, AdminProductsController],
  providers: [ProductsRepository, ProductDetailsCache, ProductsService, InventoryService],
  exports: [ProductsService, InventoryService],
})
export class ProductsModule {}
