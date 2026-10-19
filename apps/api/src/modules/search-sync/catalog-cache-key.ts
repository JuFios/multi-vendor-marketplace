import { createHash } from 'node:crypto';

import type { CatalogQuery } from '../../search';

export const CATALOG_CACHE = 'catalog';
export const CATALOG_CACHE_TTL_MS = 60_000;

/**
 * `cache:catalog:{ns}:{sha1(normalizedQuery)}`. The same request always maps to the same key:
 * fields are taken in a fixed order, absent filters are left out and the text is lower-cased.
 */
export function catalogCacheKey(namespace: string, query: CatalogQuery): string {
  const normalized = [
    query.q?.trim().toLowerCase(),
    query.categoryId,
    query.sellerId,
    query.priceMin,
    query.priceMax,
    query.ratingMin,
    query.inStock,
    query.type,
    query.sort,
    query.page,
    query.limit,
  ];
  const digest = createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
  return `cache:catalog:${namespace}:${digest}`;
}
