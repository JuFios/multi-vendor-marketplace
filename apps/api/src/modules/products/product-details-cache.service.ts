import { Injectable } from '@nestjs/common';

import { CacheService } from '../../cache';

import type { ProductDetailsResponseDto } from './dto/product-details-response.dto';

export const PRODUCT_DETAILS_CACHE = 'product';
export const PRODUCT_DETAILS_TTL_MS = 300_000;

const keyOf = (productId: string): string => `cache:product:${productId}`;

/** The public product page in Redis; every change to the product drops it (PLAN §5.12). */
@Injectable()
export class ProductDetailsCache {
  constructor(private readonly cache: CacheService) {}

  remember(
    productId: string,
    load: () => Promise<ProductDetailsResponseDto>,
  ): Promise<ProductDetailsResponseDto> {
    return this.cache.remember(
      { cache: PRODUCT_DETAILS_CACHE, key: keyOf(productId), ttlMs: PRODUCT_DETAILS_TTL_MS },
      load,
    );
  }

  /** Best-effort, for the request path after the transaction committed. */
  invalidate(productId: string): Promise<void> {
    return this.cache.del(keyOf(productId));
  }

  /** Reports a failure, so the cache consumer's job is retried. */
  invalidateOrThrow(productId: string): Promise<void> {
    return this.cache.delOrThrow(keyOf(productId));
  }
}
