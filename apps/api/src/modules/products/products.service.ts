import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';

import { productsConfig } from '../../config/products.config';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import type { CatalogQuery } from '../../search/catalog';
import type { AuctionRecord, LotListing } from '../bidding/auction';
import { AuctionsService } from '../bidding/auctions.service';
import { CategoriesService } from '../categories/categories.service';
import { SellersService } from '../sellers/sellers.service';

import {
  ProductDetailsResponseDto,
  ProductStockResponseDto,
  ProductSummaryResponseDto,
  withLot,
} from './dto/product-details-response.dto';
import {
  changedFields,
  isPublished,
  type ModerationDecision,
  type NewAuctionLot,
  type NewProduct,
  type Product,
  type ProductChanges,
  SIMILAR_PRODUCTS_LIMIT,
  type CatalogMatches,
} from './product';
import { ProductDetailsCache } from './product-details-cache.service';
import {
  FixedPriceOnlyError,
  ProductCategoryInvalidError,
  ProductNotFoundError,
  ProductNotPendingError,
  ProductStockConflictError,
} from './products.errors';
import {
  type ModerationFilter,
  type OwnedProductFilter,
  ProductsRepository,
} from './products.repository';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    @Inject(productsConfig.KEY) private readonly settings: ConfigType<typeof productsConfig>,
    private readonly products: ProductsRepository,
    private readonly categories: CategoriesService,
    private readonly sellers: SellersService,
    private readonly auctions: AuctionsService,
    private readonly detailsCache: ProductDetailsCache,
    private readonly outbox: OutboxService,
  ) {}

  async create(sellerId: string, input: NewProduct): Promise<Product> {
    await this.requireCategory(input.categoryId);
    const published = isPublished(
      { moderationStatus: 'PENDING', archivedAt: null },
      this.settings.premoderation,
    );
    const product = await this.txHost.withTransaction(async () => {
      const created = await this.products.create(sellerId, input, published);
      await this.outbox.add([
        {
          type: EVENT_TYPE.PRODUCT_CREATED,
          aggregateType: 'Product',
          aggregateId: created.id,
          payload: { productId: created.id, version: created.version },
        },
      ]);
      return created;
    });
    this.logger.log({ msg: 'product.created', productId: product.id, sellerId });
    return product;
  }

  /**
   * Creates an auction lot: the product and its first round commit together, so a lot never
   * exists without an auction.
   */
  async createAuction(
    sellerId: string,
    lot: NewAuctionLot,
  ): Promise<{ product: Product; auction: AuctionRecord }> {
    await this.requireCategory(lot.categoryId);
    const published = isPublished(
      { moderationStatus: 'PENDING', archivedAt: null },
      this.settings.premoderation,
    );
    const created = await this.txHost.withTransaction(async () => {
      const product = await this.products.createAuctionLot(sellerId, lot, published);
      const auction = await this.auctions.createForProduct({
        productId: product.id,
        sellerId,
        startPriceCents: lot.startPriceCents,
        bidStepCents: lot.bidStepCents,
        endsAt: lot.endsAt,
        published,
      });
      await this.outbox.add([
        {
          type: EVENT_TYPE.PRODUCT_CREATED,
          aggregateType: 'Product',
          aggregateId: product.id,
          payload: { productId: product.id, version: product.version },
        },
      ]);
      return { product, auction };
    });
    this.logger.log({
      msg: 'product.created',
      productId: created.product.id,
      sellerId,
      auctionId: created.auction.id,
    });
    return created;
  }

  listOwned(
    sellerId: string,
    filter: OwnedProductFilter,
  ): Promise<{ items: Product[]; total: number }> {
    return this.products.listOwned(sellerId, filter);
  }

  async getOwned(sellerId: string, id: string): Promise<Product> {
    const product = await this.products.findOwned(id, sellerId);
    if (!product) {
      throw new ProductNotFoundError();
    }
    return product;
  }

  /** Applies the seller's edits; an edit that changes nothing writes nothing. */
  async update(sellerId: string, id: string, changes: ProductChanges): Promise<Product> {
    const current = await this.requireActive(sellerId, id);
    if (changes.priceCents !== undefined && current.type !== 'FIXED_PRICE') {
      throw new FixedPriceOnlyError();
    }
    if (changes.categoryId !== undefined && changes.categoryId !== current.categoryId) {
      await this.requireCategory(changes.categoryId);
    }
    const changed = changedFields(current, changes);
    if (changed.length === 0) {
      return current;
    }
    const updated = await this.txHost.withTransaction(async () => {
      const row = await this.products.update(id, sellerId, changes);
      if (row === null) {
        throw new ProductNotFoundError();
      }
      await this.outbox.add([
        {
          type: EVENT_TYPE.PRODUCT_UPDATED,
          aggregateType: 'Product',
          aggregateId: id,
          payload: { productId: id, version: row.version, changed },
        },
      ]);
      return row;
    });
    await this.detailsCache.invalidate(id);
    this.logger.log({ msg: 'product.updated', productId: id, sellerId, changed });
    return updated;
  }

  /**
   * Replaces the stock with the given absolute value (not a delta). With `expectedStock` the
   * write only happens while the stock is still that value, so units sold meanwhile are not
   * silently counted again.
   */
  async setStock(
    sellerId: string,
    id: string,
    stock: number,
    expectedStock?: number,
  ): Promise<Product> {
    const current = await this.requireActive(sellerId, id);
    if (current.type !== 'FIXED_PRICE') {
      throw new FixedPriceOnlyError();
    }
    const updated = await this.txHost.withTransaction(async () => {
      const row = await this.products.setStock(id, sellerId, stock, expectedStock);
      if (row === null) {
        const now = await this.products.findOwned(id, sellerId);
        throw now !== null && now.archivedAt === null && expectedStock !== undefined
          ? new ProductStockConflictError({ stock: now.stock })
          : new ProductNotFoundError();
      }
      await this.outbox.add([
        {
          type: EVENT_TYPE.PRODUCT_STOCK_CHANGED,
          aggregateType: 'Product',
          aggregateId: id,
          payload: { productId: id, stock: row.stock, version: row.version },
        },
      ]);
      return row;
    });
    await this.detailsCache.invalidate(id);
    this.logger.log({ msg: 'product.stock_changed', productId: id, sellerId, stock });
    return updated;
  }

  /** Deleting a product archives it (I-16): the row stays, the catalog stops showing it. */
  async archive(sellerId: string, id: string): Promise<void> {
    const product = await this.requireActive(sellerId, id);
    await this.txHost.withTransaction(async () => {
      if (product.type === 'AUCTION') {
        await this.auctions.prepareForArchive(id);
      }
      if (!(await this.products.archive(id, sellerId))) {
        throw new ProductNotFoundError();
      }
      await this.outbox.add([
        {
          type: EVENT_TYPE.PRODUCT_ARCHIVED,
          aggregateType: 'Product',
          aggregateId: id,
          payload: { productId: id },
        },
      ]);
    });
    await this.detailsCache.invalidate(id);
    this.logger.log({ msg: 'product.archived', productId: id, sellerId });
  }

  /** The public product page, cached; unpublished and archived products are 404. */
  async getPublicDetails(id: string): Promise<ProductDetailsResponseDto> {
    const details = await this.detailsCache.remember(id, async () => {
      const product = await this.requirePublished(id);
      const [seller, category] = await Promise.all([
        this.sellers.getPublicProfile(product.sellerId),
        this.categories.findById(product.categoryId),
      ]);
      if (category === null) {
        throw new ProductNotFoundError();
      }
      return ProductDetailsResponseDto.from(
        product,
        { id: seller.id, storeName: seller.storeName },
        category,
      );
    });
    // A lot moves with every bid, so its state is read past the cache instead of waited for.
    return details.type === 'AUCTION' ? withLot(details, await this.findLot(id)) : details;
  }

  /** The availability snapshot, never cached: a lot's changes with every bid. */
  async getPublicAvailability(id: string): Promise<ProductStockResponseDto> {
    const product = await this.requirePublished(id);
    const lot = product.type === 'AUCTION' ? await this.findLot(id) : undefined;
    return ProductStockResponseDto.from(product, lot);
  }

  /** Throws `PRODUCT_NOT_FOUND` unless the public catalog shows the product. */
  async assertPublished(id: string): Promise<void> {
    await this.requirePublished(id);
  }

  /** Counts one more rating in the caller's transaction; the caller records the event. */
  async addRating(id: string, rating: number): Promise<{ ratingAvg: number; ratingCount: number }> {
    const totals = await this.products.addRating(id, rating);
    if (totals === null) {
      throw new ProductNotFoundError();
    }
    return totals;
  }

  /** Always read from the database: clients use it to resync after a reconnect. */
  getPublicStock(id: string): Promise<Product> {
    return this.requirePublished(id);
  }

  /** Other published, available products of the same category (I-18), priced as a buyer sees them. */
  async getSimilar(id: string): Promise<ProductSummaryResponseDto[]> {
    const product = await this.requirePublished(id);
    const similar = await this.products.findSimilar(product.categoryId, id, SIMILAR_PRODUCTS_LIMIT);
    const lots = await this.auctions.findListings(similar.map((other) => other.id));
    return similar.map((other) => ProductSummaryResponseDto.from(other, lots.get(other.id)));
  }

  /** The lot of an auction product; a fixed-price product has none. */
  private async findLot(id: string): Promise<LotListing | undefined> {
    return (await this.auctions.findListings([id])).get(id);
  }

  findByIds(ids: readonly string[]): Promise<Product[]> {
    return this.products.findByIds(ids);
  }

  findPublishedByIds(ids: readonly string[]): Promise<Product[]> {
    return this.products.findPublishedByIds(ids);
  }

  listPublishedBatch(
    afterId: string | null,
    limit: number,
    categoryId?: string,
  ): Promise<Product[]> {
    return this.products.listPublishedBatch(afterId, limit, categoryId);
  }

  searchCatalog(query: CatalogQuery): Promise<CatalogMatches> {
    return this.products.searchCatalog(query);
  }

  listForModeration(filter: ModerationFilter): Promise<{ items: Product[]; total: number }> {
    return this.products.listForModeration(filter);
  }

  approve(adminId: string, id: string): Promise<Product> {
    return this.moderate(adminId, id, { status: 'APPROVED' });
  }

  reject(adminId: string, id: string, reason: string): Promise<Product> {
    return this.moderate(adminId, id, { status: 'REJECTED', reason });
  }

  /**
   * The decision, the new `isPublished`, the lot's auction and `product.moderated` commit
   * together: a rejected lot stops taking bids, an approved one that waited starts its clock.
   */
  private async moderate(
    adminId: string,
    id: string,
    decision: ModerationDecision,
  ): Promise<Product> {
    const product = await this.txHost.withTransaction(async () => {
      // The lot first, then the product: the order archiving takes, so the two cannot deadlock.
      await this.auctions.lockLot(id);
      const decided = await this.products.decide(
        id,
        decision,
        isPublished(
          { moderationStatus: decision.status, archivedAt: null },
          this.settings.premoderation,
        ),
      );
      if (decided === null) {
        const existing = await this.products.findById(id);
        throw existing !== null && existing.archivedAt === null
          ? new ProductNotPendingError()
          : new ProductNotFoundError();
      }
      if (decided.type === 'AUCTION') {
        await this.auctions.onProductModerated(id, decision.status === 'APPROVED');
      }
      await this.outbox.add([
        {
          type: EVENT_TYPE.PRODUCT_MODERATED,
          aggregateType: 'Product',
          aggregateId: id,
          payload: { productId: id, moderationStatus: decided.moderationStatus },
          actorId: adminId,
        },
      ]);
      return decided;
    });
    await this.detailsCache.invalidate(id);
    this.logger.log({
      msg: `moderation.product.${decision.status === 'APPROVED' ? 'approved' : 'rejected'}`,
      adminId,
      productId: id,
      ...(decision.status === 'REJECTED' ? { reason: decision.reason } : {}),
    });
    return product;
  }

  private async requirePublished(id: string): Promise<Product> {
    const product = await this.products.findPublished(id);
    if (!product) {
      throw new ProductNotFoundError();
    }
    return product;
  }

  private async requireActive(sellerId: string, id: string): Promise<Product> {
    const product = await this.getOwned(sellerId, id);
    if (product.archivedAt !== null) {
      throw new ProductNotFoundError();
    }
    return product;
  }

  private async requireCategory(categoryId: string): Promise<void> {
    if ((await this.categories.findById(categoryId)) === null) {
      throw new ProductCategoryInvalidError();
    }
  }
}
