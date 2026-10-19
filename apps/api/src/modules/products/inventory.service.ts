import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { OutboxService } from '../../outbox';
import { EVENT_TYPE } from '../../outbox/events';
import type { AppTransactionHost } from '../../prisma';

import { ProductDetailsCache } from './product-details-cache.service';
import { InsufficientStockError } from './products.errors';
import { type ReservedProduct, ProductsRepository } from './products.repository';
import { planStockDeduction, type StockRequest } from './stock-plan';

/** The stock operations other modules may run inside their own transaction. */
@Injectable()
export class InventoryService {
  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly products: ProductsRepository,
    private readonly detailsCache: ProductDetailsCache,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Takes the stock for all requests or for none: any product that cannot be covered makes the
   * caller's transaction fail with the full list of shortages. Records `product.stock_changed`
   * per product. Returns the reserved products, with their price at that moment, ordered by id.
   */
  async reserve(requests: readonly StockRequest[]): Promise<ReservedProduct[]> {
    if (!this.txHost.isTransactionActive()) {
      throw new Error('Stock can only be reserved inside a transaction');
    }
    const { deductions } = planStockDeduction(requests);
    const reserved: ReservedProduct[] = [];
    const failed: StockRequest[] = [];
    for (const { productId, quantity } of deductions) {
      const taken = await this.products.reserveStock(productId, quantity);
      if (taken) {
        reserved.push(taken);
      } else {
        failed.push({ productId, quantity });
      }
    }
    if (failed.length > 0) {
      const stocks = new Map(
        (await this.products.findByIds(failed.map((item) => item.productId))).map((product) => [
          product.id,
          product.isPublished && product.archivedAt === null ? product.stock : 0,
        ]),
      );
      throw new InsufficientStockError(
        failed.map(({ productId, quantity }) => ({
          productId,
          requested: quantity,
          available: stocks.get(productId) ?? 0,
        })),
      );
    }
    await this.outbox.add(
      reserved.map((item) => ({
        type: EVENT_TYPE.PRODUCT_STOCK_CHANGED,
        aggregateType: 'Product',
        aggregateId: item.productId,
        payload: { productId: item.productId, stock: item.stock, version: item.version },
      })),
    );
    return reserved;
  }

  /**
   * Gives the stock of cancelled items back, in `productId` order, and records
   * `product.stock_changed` for each. Part of the caller's transaction.
   */
  async restock(requests: readonly StockRequest[]): Promise<void> {
    if (!this.txHost.isTransactionActive()) {
      throw new Error('Stock can only be restocked inside a transaction');
    }
    const { deductions } = planStockDeduction(requests);
    const changed: { productId: string; stock: number; version: number }[] = [];
    for (const { productId, quantity } of deductions) {
      const row = await this.products.restockStock(productId, quantity);
      if (row) {
        changed.push(row);
      }
    }
    await this.outbox.add(
      changed.map((item) => ({
        type: EVENT_TYPE.PRODUCT_STOCK_CHANGED,
        aggregateType: 'Product',
        aggregateId: item.productId,
        payload: item,
      })),
    );
  }

  /** Drops the cached product pages once the reserving transaction has committed. */
  async invalidateDetails(productIds: readonly string[]): Promise<void> {
    await Promise.all(productIds.map((id) => this.detailsCache.invalidate(id)));
  }
}
