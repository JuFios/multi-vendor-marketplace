import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories';
import { SellersModule } from '../sellers';

import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { SellerProductsController } from './seller-products.controller';

@Module({
  imports: [CategoriesModule, SellersModule],
  controllers: [SellerProductsController],
  providers: [ProductsRepository, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
