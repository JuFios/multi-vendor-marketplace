import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { Prisma, Product as ProductRow } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma';

import type {
  ModerationDecision,
  ModerationStatus,
  NewProduct,
  Product,
  ProductChanges,
  ProductType,
} from './product';

export interface OwnedProductFilter {
  readonly categoryId?: string | undefined;
  readonly moderationStatus?: ModerationStatus | undefined;
  readonly type?: ProductType | undefined;
  readonly page: number;
  readonly limit: number;
}

export interface ModerationFilter {
  readonly status: ModerationStatus;
  readonly page: number;
  readonly limit: number;
}

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  sellerId: row.sellerId,
  categoryId: row.categoryId,
  type: row.type,
  title: row.title,
  description: row.description,
  images: row.images,
  priceCents: row.priceCents,
  stock: row.stock,
  version: row.version,
  moderationStatus: row.moderationStatus,
  moderationReason: row.moderationReason,
  isPublished: row.isPublished,
  archivedAt: row.archivedAt,
  ratingAvg: Number(row.ratingAvg),
  ratingCount: row.ratingCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Owns `products`; every write that belongs to one seller is scoped by `sellerId`. */
@Injectable()
export class ProductsRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async create(sellerId: string, product: NewProduct, isPublished: boolean): Promise<Product> {
    const row = await this.txHost.tx.product.create({
      data: {
        sellerId,
        type: 'FIXED_PRICE',
        ...product,
        images: [...product.images],
        isPublished,
      },
    });
    return toProduct(row);
  }

  /** The seller's own product, archived or not; someone else's looks like a missing one. */
  async findOwned(id: string, sellerId: string): Promise<Product | null> {
    const row = await this.txHost.tx.product.findFirst({ where: { id, sellerId } });
    return row && toProduct(row);
  }

  /** Newest first; archived products are left out. */
  async listOwned(
    sellerId: string,
    filter: OwnedProductFilter,
  ): Promise<{ items: Product[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      sellerId,
      archivedAt: null,
      ...(filter.categoryId === undefined ? {} : { categoryId: filter.categoryId }),
      ...(filter.moderationStatus === undefined
        ? {}
        : { moderationStatus: filter.moderationStatus }),
      ...(filter.type === undefined ? {} : { type: filter.type }),
    };
    const [rows, total] = await Promise.all([
      this.txHost.tx.product.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.txHost.tx.product.count({ where }),
    ]);
    return { items: rows.map(toProduct), total };
  }

  /** Edits an active product of the seller; null when there is none. Bumps `version`. */
  async update(id: string, sellerId: string, changes: ProductChanges): Promise<Product | null> {
    const { images, ...rest } = changes;
    const { count } = await this.txHost.tx.product.updateMany({
      where: { id, sellerId, archivedAt: null },
      data: {
        ...rest,
        ...(images === undefined ? {} : { images: [...images] }),
        version: { increment: 1 },
      },
    });
    return count === 0 ? null : this.findOwned(id, sellerId);
  }

  /** Sets the absolute stock of an active product of the seller; null when there is none. */
  async setStock(id: string, sellerId: string, stock: number): Promise<Product | null> {
    const { count } = await this.txHost.tx.product.updateMany({
      where: { id, sellerId, archivedAt: null },
      data: { stock, version: { increment: 1 } },
    });
    return count === 0 ? null : this.findOwned(id, sellerId);
  }

  /** Soft delete: unpublishes the product and keeps the row; false when it is already gone. */
  async archive(id: string, sellerId: string): Promise<boolean> {
    const { count } = await this.txHost.tx.product.updateMany({
      where: { id, sellerId, archivedAt: null },
      data: { archivedAt: new Date(), isPublished: false, version: { increment: 1 } },
    });
    return count > 0;
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.txHost.tx.product.findUnique({ where: { id } });
    return row && toProduct(row);
  }

  /** A product the public catalog shows; anything else is as good as missing. */
  async findPublished(id: string): Promise<Product | null> {
    const row = await this.txHost.tx.product.findFirst({
      where: { id, isPublished: true, archivedAt: null },
    });
    return row && toProduct(row);
  }

  /** Published, in-stock products of a category other than `excludeId`, newest first. */
  async findSimilar(categoryId: string, excludeId: string, limit: number): Promise<Product[]> {
    const rows = await this.txHost.tx.product.findMany({
      where: {
        categoryId,
        id: { not: excludeId },
        isPublished: true,
        archivedAt: null,
        stock: { gt: 0 },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toProduct);
  }

  /** The moderation queue, oldest first; archived products are not moderated. */
  async listForModeration(filter: ModerationFilter): Promise<{ items: Product[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      moderationStatus: filter.status,
      archivedAt: null,
    };
    const [rows, total] = await Promise.all([
      this.txHost.tx.product.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.txHost.tx.product.count({ where }),
    ]);
    return { items: rows.map(toProduct), total };
  }

  /** Decides a PENDING product; null when it is missing, archived or already decided. */
  async decide(
    id: string,
    decision: ModerationDecision,
    isPublished: boolean,
  ): Promise<Product | null> {
    const { count } = await this.txHost.tx.product.updateMany({
      where: { id, moderationStatus: 'PENDING', archivedAt: null },
      data: {
        moderationStatus: decision.status,
        moderationReason: decision.status === 'REJECTED' ? decision.reason : null,
        isPublished,
        version: { increment: 1 },
      },
    });
    return count === 0 ? null : this.findById(id);
  }

  /** The products among `ids` that the public catalog shows. */
  async findPublishedByIds(ids: readonly string[]): Promise<Product[]> {
    const rows = await this.txHost.tx.product.findMany({
      where: { id: { in: [...ids] }, isPublished: true, archivedAt: null },
    });
    return rows.map(toProduct);
  }

  /** Published products in id order, after `afterId`; walks the catalog in fixed-size steps. */
  async listPublishedBatch(
    afterId: string | null,
    limit: number,
    categoryId?: string,
  ): Promise<Product[]> {
    const rows = await this.txHost.tx.product.findMany({
      where: {
        isPublished: true,
        archivedAt: null,
        ...(afterId === null ? {} : { id: { gt: afterId } }),
        ...(categoryId === undefined ? {} : { categoryId }),
      },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return rows.map(toProduct);
  }
}
