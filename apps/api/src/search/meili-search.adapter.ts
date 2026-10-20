import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Meilisearch, type Index } from 'meilisearch';

import { withTimeout } from '../common/utils/with-timeout';
import { searchConfig } from '../config/search.config';

import {
  buildMeiliFilter,
  buildMeiliSort,
  type CatalogDocument,
  type CatalogFacets,
  type CatalogQuery,
  type CatalogResult,
  type FacetCount,
  toCatalogItem,
} from './catalog';
import { MEILI_CLIENT } from './meili.constants';
import type { SearchPort } from './search.port';

const INDEX_NAME = 'products';
const PRIMARY_KEY = 'id';
const TASK_TIMEOUT_MS = 30_000;
const MAX_TOTAL_HITS = 10_000;
const MAX_FACET_VALUES = 1_000;
const FACETED = ['categoryId', 'sellerId', 'type', 'inStock'] as const;

const SETTINGS = {
  searchableAttributes: ['title', 'description', 'categoryName', 'sellerName'],
  filterableAttributes: ['categoryId', 'sellerId', 'type', 'priceCents', 'ratingAvg', 'inStock'],
  sortableAttributes: ['priceCents', 'ratingAvg', 'createdAt'],
  // Meilisearch caps the reachable hits and the values per facet (defaults 1000 and 100); raised
  // so totals, deep pages and the seller facet stay exact for a catalog of this size.
  pagination: { maxTotalHits: MAX_TOTAL_HITS },
  faceting: { maxValuesPerFacet: MAX_FACET_VALUES },
} as const;

const toFacetCounts = (distribution: Record<string, number> | undefined): FacetCount[] =>
  Object.entries(distribution ?? {}).map(([value, count]) => ({ value, count }));

/** Meilisearch implementation of the search port. */
@Injectable()
export class MeiliSearchAdapter implements SearchPort {
  private ready: Promise<void> | undefined;

  constructor(
    @Inject(MEILI_CLIENT) private readonly meili: Meilisearch,
    @Inject(searchConfig.KEY) private readonly settings: ConfigType<typeof searchConfig>,
  ) {}

  ensureIndex(): Promise<void> {
    this.ready ??= this.createIndex().catch((error: unknown) => {
      // A failed attempt must not be remembered, or the index could never be set up later.
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  async search(query: CatalogQuery): Promise<CatalogResult> {
    const filter = buildMeiliFilter(query);
    const sort = buildMeiliSort(query.sort);
    const params = {
      page: query.page,
      hitsPerPage: query.limit,
      facets: [...FACETED, 'priceCents'],
      filter,
      sort,
    };
    const response = await withTimeout(
      this.index().search<CatalogDocument, typeof params>(query.q ?? '', params),
      this.settings.timeoutMs,
      'catalog search',
    );
    const distribution = response.facetDistribution ?? {};
    const facets: CatalogFacets = {
      categoryId: toFacetCounts(distribution.categoryId),
      sellerId: toFacetCounts(distribution.sellerId),
      type: toFacetCounts(distribution.type),
      inStock: toFacetCounts(distribution.inStock),
    };
    const price = response.facetStats?.priceCents;
    return {
      items: response.hits.map((hit) => toCatalogItem(hit)),
      total: response.totalHits,
      page: query.page,
      limit: query.limit,
      facets,
      priceRange: price ? { min: price.min, max: price.max } : null,
    };
  }

  async upsert(documents: readonly CatalogDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }
    await this.ensureIndex();
    await this.index()
      .addDocuments([...documents])
      .waitTask({ timeout: TASK_TIMEOUT_MS });
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.ensureIndex();
    await this.index()
      .deleteDocuments([...ids])
      .waitTask({ timeout: TASK_TIMEOUT_MS });
  }

  async clear(): Promise<void> {
    await this.ensureIndex();
    await this.index().deleteAllDocuments().waitTask({ timeout: TASK_TIMEOUT_MS });
  }

  async countDocuments(): Promise<number> {
    await this.ensureIndex();
    return (await this.index().getStats()).numberOfDocuments;
  }

  private index(): Index<CatalogDocument> {
    return this.meili.index<CatalogDocument>(`${this.settings.indexPrefix}${INDEX_NAME}`);
  }

  private async createIndex(): Promise<void> {
    const created = await this.meili
      .createIndex(`${this.settings.indexPrefix}${INDEX_NAME}`, { primaryKey: PRIMARY_KEY })
      .waitTask({ timeout: TASK_TIMEOUT_MS });
    if (created.status === 'failed' && created.error?.code !== 'index_already_exists') {
      throw new Error(`creating the search index failed: ${created.error?.message ?? 'unknown'}`);
    }
    const updated = await this.index()
      .updateSettings({
        ...SETTINGS,
        searchableAttributes: [...SETTINGS.searchableAttributes],
        filterableAttributes: [...SETTINGS.filterableAttributes],
        sortableAttributes: [...SETTINGS.sortableAttributes],
      })
      .waitTask({ timeout: TASK_TIMEOUT_MS });
    if (updated.status === 'failed') {
      throw new Error(
        `configuring the search index failed: ${updated.error?.message ?? 'unknown'}`,
      );
    }
  }
}
