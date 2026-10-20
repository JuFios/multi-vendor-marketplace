import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { CacheService } from '../../cache';
import { SEARCH_DEGRADED_TOTAL } from '../../metrics/metrics.constants';
import {
  type CatalogItem,
  type CatalogQuery,
  type CatalogResult,
  SEARCH_PORT,
  type SearchPort,
} from '../../search';
import { CategoriesService } from '../categories/categories.service';
import type { Product } from '../products/product';
import type { CatalogMatches } from '../products/product';
import { ProductsService } from '../products/products.service';
import { SellersService } from '../sellers/sellers.service';

import { CATALOG_CACHE, CATALOG_CACHE_TTL_MS, catalogCacheKey } from './catalog-cache-key';
import { CatalogNamespace } from './catalog-namespace.service';
import type { CatalogPage, NamedFacet } from './catalog-page';

/** Search and filter the catalog; the index answers, and the database steps in if it cannot. */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @Inject(SEARCH_PORT) private readonly search: SearchPort,
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly sellers: SellersService,
    private readonly cache: CacheService,
    private readonly namespace: CatalogNamespace,
    @InjectMetric(SEARCH_DEGRADED_TOTAL) private readonly degradedCount: Counter,
  ) {}

  /** Cached per request under the current namespace; degraded answers are never kept. */
  async find(query: CatalogQuery): Promise<CatalogPage> {
    const namespace = await this.currentNamespace();
    if (namespace === null) {
      return this.load(query);
    }
    return this.cache.remember(
      { cache: CATALOG_CACHE, key: catalogCacheKey(namespace, query), ttlMs: CATALOG_CACHE_TTL_MS },
      () => this.load(query),
      (page) => !page.degraded,
    );
  }

  /** Without the namespace there is no safe key, so the cache is skipped, not guessed. */
  private async currentNamespace(): Promise<string | null> {
    try {
      return await this.namespace.current();
    } catch (error) {
      this.logger.warn({
        msg: 'catalog.cache_namespace_unavailable',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async load(query: CatalogQuery): Promise<CatalogPage> {
    let result: CatalogResult;
    try {
      result = await this.search.search(query);
    } catch (error) {
      this.degradedCount.inc();
      this.logger.warn({
        msg: 'search.degraded',
        error: error instanceof Error ? error.message : String(error),
      });
      return this.findInDatabase(query);
    }
    return this.toPage(query, result);
  }

  private async toPage(query: CatalogQuery, result: CatalogResult): Promise<CatalogPage> {
    const [categoryNames, sellerNames] = await Promise.all([
      this.categoryNames(),
      this.sellers.findStoreNames(result.facets.sellerId.map(({ value }) => value)),
    ]);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      limit: query.limit,
      facets: {
        categories: named(result.facets.categoryId, categoryNames),
        sellers: named(result.facets.sellerId, sellerNames),
        types: result.facets.type,
        inStock: result.facets.inStock.map(({ value, count }) => ({
          value: value === 'true',
          count,
        })),
      },
      priceRange: result.priceRange,
      degraded: false,
    };
  }

  /** Same filters from Postgres; only the category counts and the price range are offered as facets. */
  private async findInDatabase(query: CatalogQuery): Promise<CatalogPage> {
    const matches = await this.products.searchCatalog(query);
    const [categoryNames, sellerNames] = await Promise.all([
      this.categoryNames(),
      this.sellers.findStoreNames([...new Set(matches.items.map(({ sellerId }) => sellerId))]),
    ]);
    return {
      items: matches.items.flatMap((product) => {
        const item = toItem(product, categoryNames, sellerNames);
        return item ? [item] : [];
      }),
      total: matches.total,
      page: query.page,
      limit: query.limit,
      facets: {
        categories: categoryFacets(matches, categoryNames),
        sellers: [],
        types: [],
        inStock: [],
      },
      priceRange: matches.priceRange,
      degraded: true,
    };
  }

  private async categoryNames(): Promise<Map<string, string>> {
    return new Map((await this.categories.list()).map(({ id, name }) => [id, name]));
  }
}

function named(
  counts: readonly { value: string; count: number }[],
  names: ReadonlyMap<string, string>,
): NamedFacet[] {
  return counts.flatMap(({ value, count }) => {
    const name = names.get(value);
    return name === undefined ? [] : [{ id: value, name, count }];
  });
}

function categoryFacets(matches: CatalogMatches, names: ReadonlyMap<string, string>): NamedFacet[] {
  return named(
    matches.categoryCounts.map(({ categoryId, count }) => ({ value: categoryId, count })),
    names,
  );
}

function toItem(
  product: Product,
  categories: ReadonlyMap<string, string>,
  sellers: ReadonlyMap<string, string>,
): CatalogItem | null {
  const categoryName = categories.get(product.categoryId);
  const sellerName = sellers.get(product.sellerId);
  if (categoryName === undefined || sellerName === undefined) {
    return null;
  }
  return {
    id: product.id,
    title: product.title,
    type: product.type,
    priceCents: product.priceCents,
    imageUrl: product.images[0] ?? null,
    inStock: product.stock > 0,
    stock: product.stock,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    categoryId: product.categoryId,
    categoryName,
    sellerId: product.sellerId,
    sellerName,
  };
}
