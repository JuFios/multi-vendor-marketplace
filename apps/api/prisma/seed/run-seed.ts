import { hash, argon2id } from 'argon2';

import type { PrismaClient } from '../../src/generated/prisma/client';

import { AUCTIONS, CATEGORIES, productVariant, ratingAverage, type SeedAuction } from './seed-data';
import type { SeedEnv } from './seed-env';
import { seedId } from './seed-ids';

const SELLERS = [
  { key: 'seller1', name: 'Olena Kovalenko', storeName: 'Tech Hub' },
  { key: 'seller2', name: 'Andrii Melnyk', storeName: 'Urban Style' },
  { key: 'seller3', name: 'Iryna Bondar', storeName: 'Home & Books' },
] as const;

const BUYERS = [
  { key: 'buyer1', name: 'Maksym Shevchenko' },
  { key: 'buyer2', name: 'Sofiia Tkachenko' },
  { key: 'buyer3', name: 'Dmytro Lysenko' },
] as const;

const PENDING_SELLER = {
  key: 'seller-pending',
  name: 'Natalia Pavlenko',
  storeName: 'Fresh Start Goods',
} as const;

const DEMO_EMAIL_DOMAIN = 'example.com';

type Db = PrismaClient;

export async function runSeed(prisma: Db, env: SeedEnv): Promise<void> {
  const [adminPasswordHash, demoPasswordHash] = await Promise.all([
    hash(env.ADMIN_PASSWORD, { type: argon2id }),
    hash(env.SEED_DEMO_PASSWORD, { type: argon2id }),
  ]);
  // Deadlines follow database time, like the application does.
  const [{ now }] = await prisma.$queryRaw<[{ now: Date }]>`SELECT now() AS now`;

  const adminId = await seedAdmin(prisma, env.ADMIN_EMAIL, adminPasswordHash);
  const sellerIds = await seedSellers(prisma, adminId, demoPasswordHash);
  const buyerIds = await seedBuyers(prisma, demoPasswordHash);
  await seedPendingApplication(prisma, demoPasswordHash);

  const categoryIds = await seedCategories(prisma);
  await seedFixedPriceProducts(prisma, categoryIds, sellerIds);
  await seedAuctions(prisma, categoryIds, sellerIds, buyerIds, now);
}

function demoEmail(key: string): string {
  return `${key}@${DEMO_EMAIL_DOMAIN}`;
}

async function seedAdmin(prisma: Db, email: string, passwordHash: string): Promise<string> {
  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      id: seedId(`user:${email}`),
      email,
      passwordHash,
      name: 'Platform Admin',
      roles: ['CUSTOMER', 'ADMIN'],
      emailVerified: true,
    },
    // Rotating ADMIN_PASSWORD and re-seeding takes effect.
    update: { passwordHash, roles: ['CUSTOMER', 'ADMIN'] },
  });
  return admin.id;
}

async function upsertDemoUser(
  prisma: Db,
  user: { key: string; name: string },
  passwordHash: string,
  roles: ('CUSTOMER' | 'SELLER')[],
): Promise<string> {
  const email = demoEmail(user.key);
  const row = await prisma.user.upsert({
    where: { email },
    create: {
      id: seedId(`user:${email}`),
      email,
      passwordHash,
      name: user.name,
      roles,
      emailVerified: true,
    },
    update: {},
  });
  return row.id;
}

/** Returns the SellerProfile ids (not the user ids), in the order of SELLERS. */
async function seedSellers(prisma: Db, adminId: string, passwordHash: string): Promise<string[]> {
  const profileIds: string[] = [];
  for (const seller of SELLERS) {
    const userId = await upsertDemoUser(prisma, seller, passwordHash, ['CUSTOMER', 'SELLER']);
    const profile = await prisma.sellerProfile.upsert({
      where: { userId },
      create: {
        id: seedId(`seller-profile:${seller.key}`),
        userId,
        storeName: seller.storeName,
        description: `${seller.storeName}: a demo store.`,
        status: 'APPROVED',
        moderatedById: adminId,
        moderatedAt: new Date(),
      },
      update: {},
    });
    profileIds.push(profile.id);
  }
  return profileIds;
}

async function seedPendingApplication(prisma: Db, passwordHash: string): Promise<void> {
  const userId = await upsertDemoUser(prisma, PENDING_SELLER, passwordHash, ['CUSTOMER']);
  await prisma.sellerProfile.upsert({
    where: { userId },
    create: {
      id: seedId(`seller-profile:${PENDING_SELLER.key}`),
      userId,
      storeName: PENDING_SELLER.storeName,
      description: 'Waiting for moderation.',
      status: 'PENDING',
    },
    update: {},
  });
}

async function seedBuyers(prisma: Db, passwordHash: string): Promise<string[]> {
  const ids: string[] = [];
  for (const buyer of BUYERS) {
    ids.push(await upsertDemoUser(prisma, buyer, passwordHash, ['CUSTOMER']));
  }
  return ids;
}

async function seedCategories(prisma: Db): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const category of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      create: { id: seedId(`category:${category.slug}`), name: category.name, slug: category.slug },
      update: {},
    });
    ids.set(category.slug, row.id);
  }
  return ids;
}

function pick<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) {
    throw new Error('Seed list is empty');
  }
  return item;
}

function categoryId(ids: ReadonlyMap<string, string>, slug: string): string {
  const id = ids.get(slug);
  if (id === undefined) {
    throw new Error(`Unknown seed category: ${slug}`);
  }
  return id;
}

async function seedFixedPriceProducts(
  prisma: Db,
  categoryIds: ReadonlyMap<string, string>,
  sellerIds: readonly string[],
): Promise<void> {
  let index = 0;
  for (const category of CATEGORIES) {
    for (const title of category.products) {
      const variant = productVariant(index);
      await prisma.product.upsert({
        where: { id: seedId(`product:${category.slug}:${title}`) },
        create: {
          id: seedId(`product:${category.slug}:${title}`),
          sellerId: pick(sellerIds, index),
          categoryId: categoryId(categoryIds, category.slug),
          type: 'FIXED_PRICE',
          title,
          description: `${title} from the demo catalog.`,
          images: [`https://picsum.photos/seed/product-${index}/640/480`],
          priceCents: variant.priceCents,
          stock: variant.stock,
          moderationStatus: 'APPROVED',
          isPublished: true,
          ratingSum: variant.ratingSum,
          ratingCount: variant.ratingCount,
          ratingAvg: ratingAverage(variant.ratingSum, variant.ratingCount),
        },
        // Re-seeding must not undo stock or price changes made through the application.
        update: {},
      });
      index += 1;
    }
  }
}

async function seedAuctions(
  prisma: Db,
  categoryIds: ReadonlyMap<string, string>,
  sellerIds: readonly string[],
  buyerIds: readonly string[],
  now: Date,
): Promise<void> {
  for (const [index, auction] of AUCTIONS.entries()) {
    await seedAuction(prisma, auction, {
      sellerId: pick(sellerIds, index),
      categoryId: categoryId(categoryIds, auction.categorySlug),
      buyerIds,
      endsAt: new Date(now.getTime() + auction.endsInSec * 1000),
    });
  }
}

interface AuctionContext {
  sellerId: string;
  categoryId: string;
  buyerIds: readonly string[];
  endsAt: Date;
}

async function seedAuction(prisma: Db, auction: SeedAuction, ctx: AuctionContext): Promise<void> {
  const productId = seedId(`product:auction:${auction.key}`);
  const auctionId = seedId(`auction:${auction.key}`);

  await prisma.product.upsert({
    where: { id: productId },
    create: {
      id: productId,
      sellerId: ctx.sellerId,
      categoryId: ctx.categoryId,
      type: 'AUCTION',
      title: auction.title,
      description: `${auction.title} offered at auction.`,
      images: [`https://picsum.photos/seed/auction-${auction.key}/640/480`],
      stock: 1,
      moderationStatus: 'APPROVED',
      isPublished: true,
    },
    update: {},
  });

  await prisma.auction.upsert({
    where: { id: auctionId },
    create: {
      id: auctionId,
      productId,
      sellerId: ctx.sellerId,
      startPriceCents: auction.startPriceCents,
      bidStepCents: auction.bidStepCents,
      durationSec: auction.durationSec,
      endsAt: ctx.endsAt,
    },
    update: {},
  });

  // The demo round restarts from "ends in ~5 minutes" on every seed while it is still open.
  if (auction.key === 'ending-soon') {
    await prisma.auction.updateMany({
      where: { id: auctionId, status: 'ACTIVE' },
      data: { endsAt: ctx.endsAt },
    });
  }

  let lastBidId: string | undefined;
  let lastBidderId: string | undefined;
  for (const [position, amountCents] of auction.bidAmountsCents.entries()) {
    const bidderId = pick(ctx.buyerIds, position);
    const bidId = seedId(`bid:${auction.key}:${position}`);
    await prisma.bid.upsert({
      where: { id: bidId },
      create: { id: bidId, auctionId, round: 1, bidderId, amountCents },
      update: {},
    });
    lastBidId = bidId;
    lastBidderId = bidderId;
  }

  const lastAmount = auction.bidAmountsCents.at(-1);
  if (lastBidId !== undefined && lastBidderId !== undefined && lastAmount !== undefined) {
    await prisma.auction.updateMany({
      where: { id: auctionId, bidCount: 0 },
      data: {
        highestBidId: lastBidId,
        highestBidderId: lastBidderId,
        currentPriceCents: lastAmount,
        bidCount: auction.bidAmountsCents.length,
        version: auction.bidAmountsCents.length,
      },
    });
  }
}
