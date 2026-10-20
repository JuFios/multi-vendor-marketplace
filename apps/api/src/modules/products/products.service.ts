import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';

import { productsConfig } from '../../config/products.config';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import type { CatalogQuery } from '../../search/catalog';
import type { AuctionRecord } from '../bidding/auction';
import { AuctionsService } from '../bidding/auctions.service';
import { CategoriesService } from '../categories/categories.service';
import { SellersService } from '../sellers/sellers.service';

import { ProductDetailsResponseDto } from './dto/product-details-response.dto';
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

  /** Replaces the stock with the given absolute value (not a delta). */
  async setStock(sellerId: string, id: string, stock: number): Promise<Product> {
    const current = await this.requireActive(sellerId, id);
    if (current.type !== 'FIXED_PRICE') {
      throw new FixedPriceOnlyError();
    }
    const updated = await this.txHost.withTransaction(async () => {
      const row = await this.products.setStock(id, sellerId, stock);
      if (row === null) {
        throw new ProductNotFoundError();
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
    await this.requireActive(sellerId, id);
    await this.txHost.withTransaction(async () => {
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
  getPublicDetails(id: string): Promise<ProductDetailsResponseDto> {
    return this.detailsCache.remember(id, async () => {
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
  }

  /** Always read from the database: clients use it to resync after a reconnect. */
  getPublicStock(id: string): Promise<Product> {
    return this.requirePublished(id);
  }

  /** Other published, in-stock products of the same category (I-18). */
  async getSimilar(id: string): Promise<Product[]> {
    const product = await this.requirePublished(id);
    return this.products.findSimilar(product.categoryId, id, SIMILAR_PRODUCTS_LIMIT);
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

  /** The decision, the new `isPublished` and `product.moderated` commit together. */
  private async moderate(
    adminId: string,
    id: string,
    decision: ModerationDecision,
  ): Promise<Product> {
    const product = await this.txHost.withTransaction(async () => {
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
