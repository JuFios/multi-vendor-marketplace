import { dollarsToCents } from '../../lib/money';

export const CATALOG_SORTS = [
  'relevance',
  'price_asc',
  'price_desc',
  'rating_desc',
  'newest',
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type ProductType = 'FIXED_PRICE' | 'AUCTION';

export const CATALOG_PAGE_SIZE = 12;

/** Filter state as it lives in the URL; prices are whole-currency strings the user typed. */
export interface CatalogFilters {
  q: string;
  categoryId: string;
  sellerId: string;
  type: ProductType | '';
  inStock: boolean;
  priceMin: string;
  priceMax: string;
  ratingMin: string;
  sort: CatalogSort;
  page: number;
}

export const EMPTY_FILTERS: CatalogFilters = {
  q: '',
  categoryId: '',
  sellerId: '',
  type: '',
  inStock: false,
  priceMin: '',
  priceMax: '',
  ratingMin: '',
  sort: 'relevance',
  page: 1,
};

export function parseFilters(params: URLSearchParams): CatalogFilters {
  const type = params.get('type');
  const sort = params.get('sort');
  const page = Number(params.get('page'));
  return {
    q: params.get('q') ?? '',
    categoryId: params.get('categoryId') ?? '',
    sellerId: params.get('sellerId') ?? '',
    type: type === 'FIXED_PRICE' || type === 'AUCTION' ? type : '',
    inStock: params.get('inStock') === 'true',
    priceMin: params.get('priceMin') ?? '',
    priceMax: params.get('priceMax') ?? '',
    ratingMin: params.get('ratingMin') ?? '',
    sort: CATALOG_SORTS.find((candidate) => candidate === sort) ?? 'relevance',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function serializeFilters(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value !== '') {
      params.set(key, value);
    }
  };
  set('q', filters.q.trim());
  set('categoryId', filters.categoryId);
  set('sellerId', filters.sellerId);
  set('type', filters.type);
  if (filters.inStock) {
    params.set('inStock', 'true');
  }
  set('priceMin', filters.priceMin);
  set('priceMax', filters.priceMax);
  set('ratingMin', filters.ratingMin);
  if (filters.sort !== 'relevance') {
    params.set('sort', filters.sort);
  }
  if (filters.page > 1) {
    params.set('page', String(filters.page));
  }
  return params;
}

/** The API query for these filters; unparsable prices are dropped rather than sent. */
export function toCatalogQuery(filters: CatalogFilters) {
  const priceMin = dollarsToCents(filters.priceMin);
  const priceMax = dollarsToCents(filters.priceMax);
  const ratingMin = Number(filters.ratingMin);
  return {
    ...(filters.q.trim() !== '' && { q: filters.q.trim() }),
    ...(filters.categoryId !== '' && { categoryId: filters.categoryId }),
    ...(filters.sellerId !== '' && { sellerId: filters.sellerId }),
    ...(filters.type !== '' && { type: filters.type }),
    ...(filters.inStock && { inStock: true }),
    ...(priceMin !== null && { priceMin }),
    ...(priceMax !== null && { priceMax }),
    ...(filters.ratingMin !== '' && ratingMin >= 1 && ratingMin <= 5 && { ratingMin }),
    ...(filters.sort !== 'relevance' && { sort: filters.sort }),
    page: filters.page,
    limit: CATALOG_PAGE_SIZE,
  };
}
