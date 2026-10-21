export const CATALOG_SORTS = [
  'relevance',
  'price_asc',
  'price_desc',
  'rating_desc',
  'newest',
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_PRODUCT_TYPES = ['FIXED_PRICE', 'AUCTION'] as const;
export type CatalogProductType = (typeof CATALOG_PRODUCT_TYPES)[number];

export const CATALOG_AUCTION_STATUSES = [
  'ACTIVE',
  'SOLD_TO_WINNER',
  'ORDERED',
  'NOT_SOLD',
  'PENDING',
] as const;
export type CatalogAuctionStatus = (typeof CATALOG_AUCTION_STATUSES)[number];

/**
 * The layout of a stored document. Raise it whenever a field is added or changes meaning: the
 * worker rebuilds an index that still holds documents of an older layout.
 */
export const CATALOG_SCHEMA_VERSION = 2;

export const CATALOG_MAX_LIMIT = 50;
export const CATALOG_DEFAULT_LIMIT = 20;

/** A validated catalog request; the filters are already checked by the DTO. */
export interface CatalogQuery {
  readonly q?: string | undefined;
  readonly categoryId?: string | undefined;
  readonly sellerId?: string | undefined;
  readonly priceMin?: number | undefined;
  readonly priceMax?: number | undefined;
  readonly ratingMin?: number | undefined;
  readonly inStock?: boolean | undefined;
  readonly type?: CatalogProductType | undefined;
  readonly sort: CatalogSort;
  readonly page: number;
  readonly limit: number;
}

/** What the search index stores for one published product. */
export interface CatalogDocument {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly type: CatalogProductType;
  readonly priceCents: number | null;
  readonly ratingAvg: number;
  readonly ratingCount: number;
  readonly inStock: boolean;
  readonly stock: number;
  readonly createdAt: number;
  readonly imageUrl: string | null;
  readonly version: number;
  readonly schemaVersion: number;
  readonly auctionId: string | null;
  readonly auctionStatus: CatalogAuctionStatus | null;
  readonly auctionEndsAt: number | null;
}

/** The lot behind an auction product, as far as the catalog is concerned. */
export interface IndexableAuction {
  readonly id: string;
  readonly status: CatalogAuctionStatus;
  readonly endsAt: Date;
}

/** A product read from the database, with the names the index denormalizes into the document. */
export interface IndexableProduct {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly type: CatalogProductType;
  /** What a buyer pays: the price of a fixed-price product, the going bid of a lot. */
  readonly priceCents: number | null;
  readonly ratingAvg: number;
  readonly ratingCount: number;
  /** Whether a buyer can still get it: units left, or for a lot a round that takes bids. */
  readonly inStock: boolean;
  readonly stock: number;
  readonly images: readonly string[];
  readonly createdAt: Date;
  readonly version: number;
  readonly auction: IndexableAuction | null;
}

export function toCatalogDocument(product: IndexableProduct): CatalogDocument {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    type: product.type,
    priceCents: product.priceCents,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    inStock: product.inStock,
    stock: product.stock,
    createdAt: product.createdAt.getTime(),
    imageUrl: product.images[0] ?? null,
    version: product.version,
    schemaVersion: CATALOG_SCHEMA_VERSION,
    auctionId: product.auction?.id ?? null,
    auctionStatus: product.auction?.status ?? null,
    auctionEndsAt: product.auction?.endsAt.getTime() ?? null,
  };
}

/** One product in a catalog page; the same shape from the index and from the SQL fallback. */
export interface CatalogItem {
  readonly id: string;
  readonly title: string;
  readonly type: CatalogProductType;
  readonly priceCents: number | null;
  readonly imageUrl: string | null;
  readonly inStock: boolean;
  readonly stock: number;
  readonly ratingAvg: number;
  readonly ratingCount: number;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly sellerId: string;
  readonly sellerName: string;
  /** Null for a fixed-price product; the id a bid or an `auction:{id}` subscription needs. */
  readonly auctionId: string | null;
  readonly auctionStatus: CatalogAuctionStatus | null;
  readonly auctionEndsAt: string | null;
}

export function toCatalogItem(document: CatalogDocument): CatalogItem {
  return {
    id: document.id,
    title: document.title,
    type: document.type,
    priceCents: document.priceCents,
    imageUrl: document.imageUrl,
    inStock: document.inStock,
    stock: document.stock,
    ratingAvg: document.ratingAvg,
    ratingCount: document.ratingCount,
    categoryId: document.categoryId,
    categoryName: document.categoryName,
    sellerId: document.sellerId,
    sellerName: document.sellerName,
    auctionId: document.auctionId,
    auctionStatus: document.auctionStatus,
    auctionEndsAt:
      document.auctionEndsAt === null ? null : new Date(document.auctionEndsAt).toISOString(),
  };
}

export interface FacetCount {
  readonly value: string;
  readonly count: number;
}

export interface CatalogFacets {
  readonly categoryId: readonly FacetCount[];
  readonly sellerId: readonly FacetCount[];
  readonly type: readonly FacetCount[];
  readonly inStock: readonly FacetCount[];
}

export interface CatalogResult {
  readonly items: readonly CatalogItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly facets: CatalogFacets;
  /** Lowest and highest price among all matches, or null when no match has a price. */
  readonly priceRange: { readonly min: number; readonly max: number } | null;
}

/** A string literal for a Meilisearch filter: quotes and backslashes cannot end the literal. */
const quote = (value: string): string =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const wholeNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new RangeError('filter numbers must be finite');
  }
  return String(value);
};

/**
 * Meilisearch filter clauses, all of which must hold. Every value is quoted or numeric, so a
 * value can never add a clause of its own; the free-text part of a request goes in `q`.
 */
export function buildMeiliFilter(query: CatalogQuery): string[] {
  const clauses: string[] = [];
  if (query.categoryId !== undefined) {
    clauses.push(`categoryId = ${quote(query.categoryId)}`);
  }
  if (query.sellerId !== undefined) {
    clauses.push(`sellerId = ${quote(query.sellerId)}`);
  }
  if (query.type !== undefined) {
    clauses.push(`type = ${quote(query.type)}`);
  }
  if (query.priceMin !== undefined) {
    clauses.push(`priceCents >= ${wholeNumber(query.priceMin)}`);
  }
  if (query.priceMax !== undefined) {
    clauses.push(`priceCents <= ${wholeNumber(query.priceMax)}`);
  }
  if (query.ratingMin !== undefined) {
    clauses.push(`ratingAvg >= ${wholeNumber(query.ratingMin)}`);
  }
  if (query.inStock !== undefined) {
    clauses.push(`inStock = ${query.inStock}`);
  }
  return clauses;
}

const SORT_RULES: Readonly<Record<CatalogSort, readonly string[]>> = {
  relevance: [],
  price_asc: ['priceCents:asc'],
  price_desc: ['priceCents:desc'],
  rating_desc: ['ratingAvg:desc'],
  newest: ['createdAt:desc'],
};

export const buildMeiliSort = (sort: CatalogSort): string[] => [...SORT_RULES[sort]];
