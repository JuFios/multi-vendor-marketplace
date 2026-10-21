import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS, parseFilters, serializeFilters, toCatalogQuery } from './catalog-params';

describe('catalog params', () => {
  it('round-trips filters through the URL', () => {
    const filters = {
      ...EMPTY_FILTERS,
      q: 'keyboard',
      type: 'AUCTION' as const,
      inStock: true,
      priceMin: '10',
      sort: 'price_asc' as const,
      page: 3,
    };

    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });

  it('falls back to defaults for unknown values and omits defaults from the URL', () => {
    const parsed = parseFilters(new URLSearchParams('type=BOGUS&sort=oops&page=-4'));

    expect(parsed).toEqual(EMPTY_FILTERS);
    expect(serializeFilters(parsed).toString()).toBe('');
  });

  it('converts prices to cents and drops unparsable ones', () => {
    const query = toCatalogQuery({ ...EMPTY_FILTERS, priceMin: '12.5', priceMax: 'abc' });

    expect(query.priceMin).toBe(1250);
    expect(query).not.toHaveProperty('priceMax');
  });
});
