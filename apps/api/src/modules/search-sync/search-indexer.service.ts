import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  type IndexableProduct,
  SEARCH_PORT,
  type SearchPort,
  toCatalogDocument,
} from '../../search';
import { CategoriesService } from '../categories';
import { type Product, ProductsService } from '../products';
import { SellersService } from '../sellers';

import { CatalogNamespace } from './catalog-namespace.service';
import { REINDEX_BATCH_SIZE } from './search-sync.constants';

const MAX_SYNC_ATTEMPTS = 3;

const sameVersions = (before: readonly Product[], after: readonly Product[]): boolean =>
  before.length === after.length &&
  before.every((product) =>
    after.some((now) => now.id === product.id && now.version === product.version),
  );

interface Names {
  readonly categories: ReadonlyMap<string, string>;
  readonly sellers: ReadonlyMap<string, string>;
}

/**
 * Brings the search index in line with the database. It always re-reads the current state of a
 * product instead of applying the event's payload, so a repeated or reordered event is harmless.
 */
@Injectable()
export class SearchIndexer {
  private readonly logger = new Logger(SearchIndexer.name);

  constructor(
    @Inject(SEARCH_PORT) private readonly search: SearchPort,
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly sellers: SellersService,
    private readonly namespace: CatalogNamespace,
  ) {}

  /**
   * Indexes the listed products that are published, and removes the others from the index.
   *
   * Queue workers run in parallel, so two events for one product can be handled at once and the
   * slower write may carry the older state. After writing, the products are read again; if any
   * changed meanwhile, the write is repeated with the newer state.
   */
  async syncProducts(ids: readonly string[]): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      const published = await this.products.findPublishedByIds(ids);
      const { indexed, removed } = await this.apply(published, ids);
      const current = await this.products.findPublishedByIds(ids);
      if (sameVersions(published, current)) {
        await this.namespace.bump();
        this.logger.log({ msg: 'search.synced', requested: ids.length, indexed, removed });
        return;
      }
      if (attempt >= MAX_SYNC_ATTEMPTS) {
        throw new Error('products kept changing while the search index was being updated');
      }
    }
  }

  /** A renamed category changes the denormalized name of every product in it. */
  async syncCategory(categoryId: string): Promise<void> {
    let after: string | null = null;
    for (;;) {
      const batch = await this.products.listPublishedBatch(after, REINDEX_BATCH_SIZE, categoryId);
      if (batch.length === 0) {
        break;
      }
      await this.apply(
        batch,
        batch.map(({ id }) => id),
      );
      after = batch.at(-1)?.id ?? null;
    }
    await this.namespace.bump();
    this.logger.log({ msg: 'search.category_synced', categoryId });
  }

  /** Rebuilds the index from the database; `clear` first drops documents of deleted products. */
  async reindexAll({ clear }: { clear: boolean }): Promise<number> {
    await this.search.ensureIndex();
    if (clear) {
      await this.search.clear();
    }
    let indexed = 0;
    let after: string | null = null;
    for (;;) {
      const batch = await this.products.listPublishedBatch(after, REINDEX_BATCH_SIZE);
      if (batch.length === 0) {
        break;
      }
      indexed += (
        await this.apply(
          batch,
          batch.map(({ id }) => id),
        )
      ).indexed;
      after = batch.at(-1)?.id ?? null;
    }
    await this.namespace.bump();
    this.logger.log({ msg: 'search.reindexed', indexed, cleared: clear });
    return indexed;
  }

  /** Upserts what can be shown and removes everything else among `requested`. */
  private async apply(
    published: readonly Product[],
    requested: readonly string[],
  ): Promise<{ indexed: number; removed: number }> {
    const names = await this.namesFor(published);
    const documents = published.flatMap((product) => {
      const indexable = this.toIndexable(product, names);
      return indexable ? [toCatalogDocument(indexable)] : [];
    });
    const kept = new Set(documents.map(({ id }) => id));
    const removed = requested.filter((id) => !kept.has(id));
    await this.search.upsert(documents);
    await this.search.remove(removed);
    return { indexed: documents.length, removed: removed.length };
  }

  private async namesFor(products: readonly Product[]): Promise<Names> {
    if (products.length === 0) {
      return { categories: new Map(), sellers: new Map() };
    }
    const [categories, sellers] = await Promise.all([
      this.categories.list(),
      this.sellers.findStoreNames([...new Set(products.map(({ sellerId }) => sellerId))]),
    ]);
    return { categories: new Map(categories.map(({ id, name }) => [id, name])), sellers };
  }

  /** A product whose store is not approved, or whose category is gone, is not shown. */
  private toIndexable(product: Product, names: Names): IndexableProduct | null {
    const categoryName = names.categories.get(product.categoryId);
    const sellerName = names.sellers.get(product.sellerId);
    if (categoryName === undefined || sellerName === undefined) {
      return null;
    }
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      categoryId: product.categoryId,
      categoryName,
      sellerId: product.sellerId,
      sellerName,
      type: product.type,
      priceCents: product.priceCents,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
      stock: product.stock,
      images: product.images,
      createdAt: product.createdAt,
      version: product.version,
    };
  }
}
