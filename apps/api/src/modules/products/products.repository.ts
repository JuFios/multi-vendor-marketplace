import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { Prisma, Product as ProductRow } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma';
import type { CatalogQuery, CatalogSort } from '../../search';

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

/** A fixed-price product as it was at the moment its stock was taken. */
export interface ReservedProduct {
  readonly productId: string;
  readonly sellerId: string;
  readonly title: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  /** The stock left and the version after the deduction. */
  readonly stock: number;
  readonly version: number;
}

export interface CatalogMatches {
  readonly items: Product[];
  readonly total: number;
  readonly categoryCounts: readonly { categoryId: string; count: number }[];
  readonly priceRange: { min: number; max: number } | null;
}

const CATALOG_ORDER: Readonly<Record<CatalogSort, Prisma.ProductOrderByWithRelationInput[]>> = {
  relevance: [{ createdAt: 'desc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_asc: [{ priceCents: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  price_desc: [{ priceCents: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
  rating_desc: [{ ratingAvg: 'desc' }, { id: 'asc' }],
};

/** Escapes the LIKE wildcards, so a search for "50%" means those characters. */
const likePattern = (text: string): string => text.replace(/[\\%_]/g, '\\$&');

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

  /**
   * Takes `quantity` units in one conditional UPDATE: the row is only touched while it is still
   * published and holds enough, so stock cannot go below zero however many buyers race.
   */
  async reserveStock(id: string, quantity: number): Promise<ReservedProduct | null> {
    const rows = await this.txHost.tx.$queryRaw<
      {
        id: string;
        seller_id: string;
        title: string;
        price_cents: number;
        stock: number;
        version: number;
      }[]
    >`
      UPDATE products
      SET stock = stock - ${quantity}, version = version + 1, updated_at = now()
      WHERE id = ${id}::uuid AND stock >= ${quantity} AND is_published
        AND archived_at IS NULL AND type = 'FIXED_PRICE'
      RETURNING id, seller_id, title, price_cents, stock, version`;
    const row = rows[0];
    return row
      ? {
          productId: row.id,
          sellerId: row.seller_id,
          title: row.title,
          unitPriceCents: row.price_cents,
          quantity,
          stock: row.stock,
          version: row.version,
        }
      : null;
  }

  /** The products among `ids`, whatever their state: callers decide what unpublished means. */
  async findByIds(ids: readonly string[]): Promise<Product[]> {
    const rows = await this.txHost.tx.product.findMany({ where: { id: { in: [...ids] } } });
    return rows.map(toProduct);
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

  /**
   * The catalog straight from the database, for when the search index cannot answer: the same
   * filters, a title substring instead of full-text search, no typo tolerance and no relevance.
   */
  async searchCatalog(query: CatalogQuery): Promise<CatalogMatches> {
    const where: Prisma.ProductWhereInput = {
      isPublished: true,
      archivedAt: null,
      ...(query.q === undefined
        ? {}
        : { title: { contains: likePattern(query.q), mode: 'insensitive' } }),
      ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
      ...(query.sellerId === undefined ? {} : { sellerId: query.sellerId }),
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.inStock === undefined ? {} : { stock: query.inStock ? { gt: 0 } : 0 }),
      ...(query.ratingMin === undefined ? {} : { ratingAvg: { gte: query.ratingMin } }),
      ...(query.priceMin === undefined && query.priceMax === undefined
        ? {}
        : {
            priceCents: {
              ...(query.priceMin === undefined ? {} : { gte: query.priceMin }),
              ...(query.priceMax === undefined ? {} : { lte: query.priceMax }),
            },
          }),
    };
    const [rows, total, categories, prices] = await Promise.all([
      this.txHost.tx.product.findMany({
        where,
        orderBy: CATALOG_ORDER[query.sort],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.txHost.tx.product.count({ where }),
      this.txHost.tx.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
      this.txHost.tx.product.aggregate({
        where,
        _min: { priceCents: true },
        _max: { priceCents: true },
      }),
    ]);
    const { priceCents: min } = prices._min;
    const { priceCents: max } = prices._max;
    return {
      items: rows.map(toProduct),
      total,
      categoryCounts: categories.map((row) => ({
        categoryId: row.categoryId,
        count: row._count._all,
      })),
      priceRange: min === null || max === null ? null : { min, max },
    };
  }
}
