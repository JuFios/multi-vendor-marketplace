import { Module } from '@nestjs/common';

import { AdminCategoriesController } from './admin-categories.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesRepository, CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
