import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { Prisma, type Product as ProductRow } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';
import type { CatalogQuery, CatalogSort } from '../../search/catalog';

import type {
  ModerationDecision,
  ModerationStatus,
  NewAuctionLot,
  NewProduct,
  Product,
  ProductChanges,
  ProductType,
  CatalogMatches,
  ReservedProduct,
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

/**
 * What a buyer pays for the product: its price, or for a lot the leading bid (its start price
 * while nobody has bid). A lot's own `price_cents` is null, so filtering and sorting on it would
 * drop every auction from the catalog.
 */
const LISTING_PRICE = Prisma.sql`CASE
  WHEN p.type = 'AUCTION'::product_type THEN COALESCE(a.current_price_cents, a.start_price_cents)
  ELSE p.price_cents END`;

/** Whether a buyer can still get it: units left, or for a lot a round that still takes bids. */
const LISTING_AVAILABLE = Prisma.sql`CASE
  WHEN p.type = 'AUCTION'::product_type
    THEN COALESCE(a.status = 'ACTIVE'::auction_status AND a.ends_at > now(), FALSE)
  ELSE p.stock > 0 END`;

/** The product columns under the names `toProduct` reads, so one mapper serves both paths. */
const PRODUCT_COLUMNS = Prisma.sql`p.id, p.seller_id AS "sellerId", p.category_id AS "categoryId",
  p.type, p.title, p.description, p.images, p.price_cents AS "priceCents", p.stock, p.version,
  p.moderation_status AS "moderationStatus", p.moderation_reason AS "moderationReason",
  p.is_published AS "isPublished", p.archived_at AS "archivedAt", p.rating_sum AS "ratingSum",
  p.rating_count AS "ratingCount", p.rating_avg AS "ratingAvg", p.created_at AS "createdAt",
  p.updated_at AS "updatedAt"`;

const CATALOG_FROM = Prisma.sql`FROM products AS p
  JOIN seller_profiles AS sp ON sp.id = p.seller_id AND sp.status = 'APPROVED'::seller_status
  LEFT JOIN auctions AS a ON a.product_id = p.id`;

const CATALOG_ORDER: Readonly<Record<CatalogSort, Prisma.Sql>> = {
  relevance: Prisma.sql`p.created_at DESC, p.id ASC`,
  newest: Prisma.sql`p.created_at DESC, p.id ASC`,
  price_asc: Prisma.sql`${LISTING_PRICE} ASC NULLS LAST, p.id ASC`,
  price_desc: Prisma.sql`${LISTING_PRICE} DESC NULLS LAST, p.id ASC`,
  rating_desc: Prisma.sql`p.rating_avg DESC, p.id ASC`,
};

/** Escapes the LIKE wildcards, so a search for "50%" means those characters. */
const likePattern = (text: string): string => text.replace(/[\\%_]/g, '\\$&');

/**
 * The catalog filters as SQL over `products AS p` joined with `auctions AS a`. Every value goes
 * in as a parameter, so none of them can add a clause of its own.
 */
function catalogWhere(query: CatalogQuery): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`p.is_published = TRUE AND p.archived_at IS NULL`];
  if (query.q !== undefined) {
    clauses.push(Prisma.sql`p.title ILIKE ${`%${likePattern(query.q)}%`}`);
  }
  if (query.categoryId !== undefined) {
    clauses.push(Prisma.sql`p.category_id = ${query.categoryId}::uuid`);
  }
  if (query.sellerId !== undefined) {
    clauses.push(Prisma.sql`p.seller_id = ${query.sellerId}::uuid`);
  }
  if (query.type !== undefined) {
    clauses.push(Prisma.sql`p.type = ${query.type}::product_type`);
  }
  if (query.ratingMin !== undefined) {
    clauses.push(Prisma.sql`p.rating_avg >= ${query.ratingMin}::numeric`);
  }
  if (query.inStock !== undefined) {
    clauses.push(Prisma.sql`${LISTING_AVAILABLE} = ${query.inStock}`);
  }
  if (query.priceMin !== undefined) {
    clauses.push(Prisma.sql`${LISTING_PRICE} >= ${query.priceMin}`);
  }
  if (query.priceMax !== undefined) {
    clauses.push(Prisma.sql`${LISTING_PRICE} <= ${query.priceMax}`);
  }
  return Prisma.join(clauses, ' AND ');
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

  /** An auction lot's product: no price of its own, and one unit that the auction sells. */
  async createAuctionLot(
    sellerId: string,
    lot: Pick<NewAuctionLot, 'categoryId' | 'title' | 'description' | 'images'>,
    isPublished: boolean,
  ): Promise<Product> {
    const row = await this.txHost.tx.product.create({
      data: {
        sellerId,
        type: 'AUCTION',
        categoryId: lot.categoryId,
        title: lot.title,
        description: lot.description,
        images: [...lot.images],
        priceCents: null,
        stock: 1,
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

  /**
   * Sets the absolute stock of an active product of the seller, only at `expectedVersion` when
   * given; null when no such row was updated.
   */
  async setStock(
    id: string,
    sellerId: string,
    stock: number,
    expectedVersion?: number,
  ): Promise<Product | null> {
    const { count } = await this.txHost.tx.product.updateMany({
      where: {
        id,
        sellerId,
        archivedAt: null,
        ...(expectedVersion === undefined ? {} : { version: expectedVersion }),
      },
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

  /** Gives `quantity` units back; the product keeps whatever state it is in. */
  async restockStock(
    id: string,
    quantity: number,
  ): Promise<{ productId: string; stock: number; version: number } | null> {
    const rows = await this.txHost.tx.$queryRaw<{ id: string; stock: number; version: number }[]>`
      UPDATE products
      SET stock = stock + ${quantity}, version = version + 1, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, stock, version`;
    const row = rows[0];
    return row ? { productId: row.id, stock: row.stock, version: row.version } : null;
  }

  /**
   * Adds one rating in a single UPDATE: sum, count and the two-decimal average move together,
   * so concurrent reviews cannot lose each other's contribution. The version moves too, or the
   * search indexer's race re-check would not see the change.
   */
  async addRating(
    id: string,
    rating: number,
  ): Promise<{ ratingAvg: number; ratingCount: number } | null> {
    const rows = await this.txHost.tx.$queryRaw<{ rating_avg: string; rating_count: number }[]>`
      UPDATE products
      SET rating_sum = rating_sum + ${rating},
          rating_count = rating_count + 1,
          rating_avg = ROUND((rating_sum + ${rating})::numeric / (rating_count + 1), 2),
          version = version + 1,
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING rating_avg::text, rating_count`;
    const row = rows[0];
    return row ? { ratingAvg: Number(row.rating_avg), ratingCount: row.rating_count } : null;
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

  /** Published products a buyer can still get, of a category other than `excludeId`, newest first. */
  async findSimilar(categoryId: string, excludeId: string, limit: number): Promise<Product[]> {
    const rows = await this.txHost.tx.$queryRaw<ProductRow[]>`
      SELECT ${PRODUCT_COLUMNS} ${CATALOG_FROM}
      WHERE p.category_id = ${categoryId}::uuid AND p.id <> ${excludeId}::uuid
        AND p.is_published = TRUE AND p.archived_at IS NULL AND ${LISTING_AVAILABLE}
      ORDER BY p.created_at DESC, p.id ASC
      LIMIT ${limit}`;
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
   * Price and availability come from the lot of an auction product, as they do in the index.
   */
  async searchCatalog(query: CatalogQuery): Promise<CatalogMatches> {
    const where = catalogWhere(query);
    const [rows, counted, categories, prices] = await Promise.all([
      this.txHost.tx.$queryRaw<ProductRow[]>`
        SELECT ${PRODUCT_COLUMNS} ${CATALOG_FROM}
        WHERE ${where}
        ORDER BY ${CATALOG_ORDER[query.sort]}
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      this.txHost.tx.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total ${CATALOG_FROM} WHERE ${where}`,
      this.txHost.tx.$queryRaw<{ categoryId: string; count: number }[]>`
        SELECT p.category_id AS "categoryId", count(*)::int AS count ${CATALOG_FROM}
        WHERE ${where} GROUP BY p.category_id`,
      this.txHost.tx.$queryRaw<{ min: number | null; max: number | null }[]>`
        SELECT min(${LISTING_PRICE}) AS min, max(${LISTING_PRICE}) AS max
        ${CATALOG_FROM} WHERE ${where}`,
    ]);
    const [range] = prices;
    const min = range?.min ?? null;
    const max = range?.max ?? null;
    return {
      items: rows.map(toProduct),
      total: counted[0]?.total ?? 0,
      categoryCounts: categories.map((row) => ({
        categoryId: row.categoryId,
        count: row.count,
      })),
      priceRange: min === null || max === null ? null : { min, max },
    };
  }
}
