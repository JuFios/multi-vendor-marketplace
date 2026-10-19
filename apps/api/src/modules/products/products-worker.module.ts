import { Module } from '@nestjs/common';

import { ProductDetailsCache } from './product-details-cache.service';
import { ProductsCacheProcessor } from './products-cache.processor';

/** The product queue consumers; registered in the worker process only. */
@Module({ providers: [ProductDetailsCache, ProductsCacheProcessor] })
export class ProductsWorkerModule {}
