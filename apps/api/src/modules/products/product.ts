export const PRODUCT_TYPES = ['FIXED_PRICE', 'AUCTION'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const MODERATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const PRODUCT_TITLE_MAX_LENGTH = 200;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;
export const PRODUCT_MAX_IMAGES = 5;
export const PRODUCT_IMAGE_URL_MAX_LENGTH = 2048;
export const PRODUCT_MAX_STOCK = 1_000_000;

/** A product as the catalog sees it; `priceCents` is null for auction lots. */
export interface Product {
  readonly id: string;
  readonly sellerId: string;
  readonly categoryId: string;
  readonly type: ProductType;
  readonly title: string;
  readonly description: string;
  readonly images: readonly string[];
  readonly priceCents: number | null;
  readonly stock: number;
  readonly version: number;
  readonly moderationStatus: ModerationStatus;
  readonly moderationReason: string | null;
  readonly isPublished: boolean;
  readonly archivedAt: Date | null;
  readonly ratingAvg: number;
  readonly ratingCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewProduct {
  readonly categoryId: string;
  readonly title: string;
  readonly description: string;
  readonly images: readonly string[];
  readonly priceCents: number;
  readonly stock: number;
}

/** The fields a seller may edit; stock has its own operation and `type` never changes. */
export interface ProductChanges {
  readonly categoryId?: string;
  readonly title?: string;
  readonly description?: string;
  readonly images?: readonly string[];
  readonly priceCents?: number;
}

type Moderated = Pick<Product, 'moderationStatus' | 'archivedAt'>;

/**
 * Whether the public catalog shows the product (I-13). An archived or rejected product is
 * never shown; an approved one always is; a pending one only when pre-moderation is off.
 */
export function isPublished(product: Moderated, premoderation: boolean): boolean {
  if (product.archivedAt !== null || product.moderationStatus === 'REJECTED') {
    return false;
  }
  return product.moderationStatus === 'APPROVED' || !premoderation;
}

const sameImages = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((url, index) => url === b[index]);

/** Names of the fields in `changes` whose value differs from the current product. */
export function changedFields(
  current: Pick<Product, keyof ProductChanges>,
  changes: ProductChanges,
): (keyof ProductChanges)[] {
  const keys = Object.keys(changes) as (keyof ProductChanges)[];
  return keys.filter((key) => {
    const next = changes[key];
    if (next === undefined) {
      return false;
    }
    const previous = current[key];
    return Array.isArray(next) && Array.isArray(previous)
      ? !sameImages(previous as readonly string[], next as readonly string[])
      : previous !== next;
  });
}
