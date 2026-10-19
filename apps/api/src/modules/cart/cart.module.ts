import { Module } from '@nestjs/common';

import { ProductsModule } from '../products';
import { SellersModule } from '../sellers';

import { CartController } from './cart.controller';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

@Module({
  imports: [ProductsModule, SellersModule],
  controllers: [CartController],
  providers: [CartRepository, CartService],
  exports: [CartService],
})
export class CartModule {}
