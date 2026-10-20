import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';

import { ReviewsController } from './reviews.controller';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [OrdersModule, ProductsModule, UsersModule],
  controllers: [ReviewsController],
  providers: [ReviewsRepository, ReviewsService],
})
export class ReviewsModule {}
