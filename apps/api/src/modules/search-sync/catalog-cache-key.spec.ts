import type { CatalogQuery } from '../../search/catalog';

import { catalogCacheKey } from './catalog-cache-key';

const base: CatalogQuery = { sort: 'relevance', page: 1, limit: 20 };

describe('catalogCacheKey', () => {
  it('is stable for the same request', () => {
    expect(catalogCacheKey('3', { ...base, q: 'phone' })).toBe(
      catalogCacheKey('3', { ...base, q: 'phone' }),
    );
  });

  it('starts with the namespace, so a new namespace retires every old key', () => {
    expect(catalogCacheKey('3', base)).toMatch(/^cache:catalog:3:[0-9a-f]{40}$/);
    expect(catalogCacheKey('4', base)).not.toBe(catalogCacheKey('3', base));
  });

  it('ignores the case and the surrounding spaces of the text', () => {
    expect(catalogCacheKey('1', { ...base, q: '  Phone ' })).toBe(
      catalogCacheKey('1', { ...base, q: 'phone' }),
    );
  });

  it.each<[string, Partial<CatalogQuery>]>([
    ['text', { q: 'phone' }],
    ['category', { categoryId: 'c1' }],
    ['seller', { sellerId: 's1' }],
    ['minimum price', { priceMin: 100 }],
    ['maximum price', { priceMax: 100 }],
    ['rating', { ratingMin: 4 }],
    ['stock flag', { inStock: false }],
    ['type', { type: 'AUCTION' }],
    ['sort', { sort: 'price_asc' }],
    ['page', { page: 2 }],
    ['page size', { limit: 10 }],
  ])('differs when the %s differs', (_name, change) => {
    expect(catalogCacheKey('1', { ...base, ...change })).not.toBe(catalogCacheKey('1', base));
  });

  it('keeps a price of one value apart from a rating of the same value', () => {
    expect(catalogCacheKey('1', { ...base, priceMin: 4 })).not.toBe(
      catalogCacheKey('1', { ...base, ratingMin: 4 }),
    );
  });
});
