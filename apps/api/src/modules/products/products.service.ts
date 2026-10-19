import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';

import { productsConfig } from '../../config';
import { OutboxService } from '../../outbox';
import { EVENT_TYPE } from '../../outbox/events';
import type { AppTransactionHost } from '../../prisma';
import { CategoriesService } from '../categories';

import {
  changedFields,
  isPublished,
  type NewProduct,
  type Product,
  type ProductChanges,
  type ProductType,
} from './product';
import {
  AuctionProductsNotSupportedError,
  FixedPriceOnlyError,
  ProductCategoryInvalidError,
  ProductNotFoundError,
} from './products.errors';
import { type OwnedProductFilter, ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    @Inject(productsConfig.KEY) private readonly settings: ConfigType<typeof productsConfig>,
    private readonly products: ProductsRepository,
    private readonly categories: CategoriesService,
    private readonly outbox: OutboxService,
  ) {}

  async create(sellerId: string, type: ProductType, input: NewProduct): Promise<Product> {
    if (type === 'AUCTION') {
      // TODO: auction creation
      throw new AuctionProductsNotSupportedError();
    }
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
    this.logger.log({ msg: 'product.archived', productId: id, sellerId });
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
