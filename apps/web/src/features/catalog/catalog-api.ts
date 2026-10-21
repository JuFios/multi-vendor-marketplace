import { api, unwrap } from '../../lib/api/api';
import type { components } from '../../lib/api/schema';

import { toCatalogQuery, type CatalogFilters } from './catalog-params';

export type CatalogPage = components['schemas']['CatalogPageDto'];
export type CatalogItem = components['schemas']['CatalogItemDto'];

export function fetchCatalog(filters: CatalogFilters): Promise<CatalogPage> {
  return unwrap(api.GET('/api/catalog', { params: { query: toCatalogQuery(filters) } }));
}

export function fetchCategories() {
  return unwrap(api.GET('/api/categories'));
}
