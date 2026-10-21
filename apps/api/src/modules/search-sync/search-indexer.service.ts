import { Inject, Injectable, Logger } from '@nestjs/common';

import { type IndexableProduct, toCatalogDocument } from '../../search/catalog';
import { SEARCH_PORT, type SearchPort } from '../../search/search.port';
import type { LotListing } from '../bidding/auction';
import { AuctionsService } from '../bidding/auctions.service';
import { CategoriesService } from '../categories/categories.service';
import { publicListingOf, type Product } from '../products/product';
import { ProductsService } from '../products/products.service';
import { SellersService } from '../sellers/sellers.service';

import { CatalogNamespace } from './catalog-namespace.service';
import { REINDEX_BATCH_SIZE } from './search-sync.constants';

const MAX_SYNC_ATTEMPTS = 3;

type Lots = ReadonlyMap<string, LotListing>;

const sameVersions = (before: readonly Product[], after: readonly Product[]): boolean =>
  before.length === after.length &&
  before.every((product) =>
    after.some((now) => now.id === product.id && now.version === product.version),
  );

/**
 * Whether every lot is still at the version its document was built from. A bid moves the auction,
 * not the product, so the product versions alone would not show that a write is already stale.
 */
const sameLotVersions = (before: Lots, after: Lots): boolean =>
  [...before].every(([productId, lot]) => after.get(productId)?.version === lot.version);

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
    private readonly auctions: AuctionsService,
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
      const [published, lots] = await this.readState(ids);
      const { indexed, removed } = await this.apply(published, lots, ids);
      const [current, currentLots] = await this.readState(ids);
      if (sameVersions(published, current) && sameLotVersions(lots, currentLots)) {
        // Bids and stock changes arrive in bursts; one retirement of the cached pages covers them.
        await this.namespace.bumpSoon();
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
      const ids = batch.map(({ id }) => id);
      await this.apply(batch, await this.auctions.findListings(ids), ids);
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
      const ids = batch.map(({ id }) => id);
      indexed += (await this.apply(batch, await this.auctions.findListings(ids), ids)).indexed;
      after = batch.at(-1)?.id ?? null;
    }
    await this.namespace.bump();
    this.logger.log({ msg: 'search.reindexed', indexed, cleared: clear });
    return indexed;
  }

  /** The products the catalog shows and the state of their lots, read together. */
  private readState(ids: readonly string[]): Promise<[Product[], Lots]> {
    return Promise.all([this.products.findPublishedByIds(ids), this.auctions.findListings(ids)]);
  }

  /** Upserts what can be shown and removes everything else among `requested`. */
  private async apply(
    published: readonly Product[],
    lots: Lots,
    requested: readonly string[],
  ): Promise<{ indexed: number; removed: number }> {
    const names = await this.namesFor(published);
    const documents = published.flatMap((product) => {
      const indexable = this.toIndexable(product, names, lots.get(product.id));
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

  /**
   * A product whose store is not approved, or whose category is gone, is not shown. A lot carries
   * the price and the availability of its auction: its own `priceCents` is null and its single
   * unit of stock says nothing about whether it can still be won.
   */
  private toIndexable(
    product: Product,
    names: Names,
    lot: LotListing | undefined,
  ): IndexableProduct | null {
    const categoryName = names.categories.get(product.categoryId);
    const sellerName = names.sellers.get(product.sellerId);
    if (categoryName === undefined || sellerName === undefined) {
      return null;
    }
    const listing = publicListingOf(product, lot);
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      categoryId: product.categoryId,
      categoryName,
      sellerId: product.sellerId,
      sellerName,
      type: product.type,
      priceCents: listing.priceCents,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
      inStock: listing.inStock,
      stock: product.stock,
      images: product.images,
      createdAt: product.createdAt,
      version: product.version,
      auction:
        listing.auction === null
          ? null
          : {
              id: listing.auction.auctionId,
              status: listing.auction.status,
              endsAt: listing.auction.endsAt,
            },
    };
  }
}
