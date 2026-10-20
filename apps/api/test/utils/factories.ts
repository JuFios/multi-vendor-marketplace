import { randomUUID } from 'node:crypto';

import type {
  Auction,
  Category,
  Order,
  PrismaClient,
  Product,
  SellerOrder,
  SellerOrderItem,
  SellerProfile,
  User,
} from '../../src/generated/prisma/client';

const unique = (): string => randomUUID().slice(0, 8);

export type Overrides<T> = Partial<T>;

export function createUser(prisma: PrismaClient, overrides: Overrides<User> = {}): Promise<User> {
  return prisma.user.create({
    data: { email: `user-${unique()}@example.com`, name: 'Test User', ...overrides },
  });
}

/** An approved seller: the user (with the SELLER role) and its store profile. */
export async function createSeller(
  prisma: PrismaClient,
  overrides: Overrides<SellerProfile> = {},
): Promise<{ user: User; seller: SellerProfile }> {
  const user = await createUser(prisma, { roles: ['CUSTOMER', 'SELLER'] });
  const seller = await prisma.sellerProfile.create({
    data: {
      userId: user.id,
      storeName: `Store ${unique()}`,
      status: 'APPROVED',
      ...overrides,
    },
  });
  return { user, seller };
}

export function createCategory(
  prisma: PrismaClient,
  overrides: Overrides<Category> = {},
): Promise<Category> {
  const suffix = unique();
  return prisma.category.create({
    data: { name: `Category ${suffix}`, slug: `category-${suffix}`, ...overrides },
  });
}

export async function createProduct(
  prisma: PrismaClient,
  overrides: Overrides<Product> = {},
): Promise<Product> {
  const sellerId = overrides.sellerId ?? (await createSeller(prisma)).seller.id;
  const categoryId = overrides.categoryId ?? (await createCategory(prisma)).id;
  return prisma.product.create({
    data: {
      type: 'FIXED_PRICE',
      title: `Product ${unique()}`,
      description: 'A product created by a test factory.',
      images: [],
      priceCents: 10_000,
      stock: 10,
      moderationStatus: 'APPROVED',
      isPublished: true,
      ...overrides,
      sellerId,
      categoryId,
    },
  });
}

export async function createAuction(
  prisma: PrismaClient,
  overrides: Overrides<Auction> = {},
): Promise<Auction> {
  const product =
    overrides.productId === undefined
      ? await createProduct(prisma, { type: 'AUCTION', priceCents: null, stock: 1 })
      : await prisma.product.findUniqueOrThrow({ where: { id: overrides.productId } });
  return prisma.auction.create({
    data: {
      startPriceCents: 10_000,
      bidStepCents: 500,
      durationSec: 3_600,
      endsAt: new Date(Date.now() + 3_600_000),
      ...overrides,
      productId: product.id,
      sellerId: overrides.sellerId ?? product.sellerId,
    },
  });
}

export interface CreatedSellerOrder {
  product: Product;
  order: Order;
  sellerOrder: SellerOrder;
  item: SellerOrderItem;
  customer: User;
}

/** A single-seller order with one item, in the state right after checkout. */
export async function createSellerOrder(
  prisma: PrismaClient,
  options: {
    quantity?: number;
    unitPriceCents?: number;
    /** The store that sells the item; a new store when omitted. */
    sellerId?: string;
    /** A product of the store to sell; a new product when omitted. */
    productId?: string;
    /** When the order was placed; now when omitted. */
    createdAt?: Date;
  } = {},
): Promise<CreatedSellerOrder> {
  const quantity = options.quantity ?? 2;
  const unitPriceCents = options.unitPriceCents ?? 10_000;
  const subtotalCents = quantity * unitPriceCents;
  const product =
    options.productId === undefined
      ? await createProduct(prisma, {
          priceCents: unitPriceCents,
          ...(options.sellerId === undefined ? {} : { sellerId: options.sellerId }),
        })
      : await prisma.product.findUniqueOrThrow({ where: { id: options.productId } });
  const customer = await createUser(prisma);
  const placedAt = options.createdAt === undefined ? {} : { createdAt: options.createdAt };
  const order = await prisma.order.create({
    data: {
      ...placedAt,
      customerId: customer.id,
      subtotalCents,
      totalCents: subtotalCents,
      commissionCents: Math.round(subtotalCents / 10),
    },
  });
  const sellerOrder = await prisma.sellerOrder.create({
    data: {
      ...placedAt,
      orderId: order.id,
      sellerId: product.sellerId,
      subtotalCents,
      commissionRateBps: 1_000,
      commissionCents: Math.round(subtotalCents / 10),
      payoutCents: subtotalCents - Math.round(subtotalCents / 10),
    },
  });
  const item = await prisma.sellerOrderItem.create({
    data: {
      sellerOrderId: sellerOrder.id,
      productId: product.id,
      titleSnapshot: product.title,
      unitPriceCents,
      quantity,
    },
  });
  return { product, order, sellerOrder, item, customer };
}
