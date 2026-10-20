import { argon2id, hash } from 'argon2';

import { Prisma, type PrismaClient } from '../../src/generated/prisma/client';

import {
  HISTORY_BUYERS,
  HISTORY_DAYS,
  type HistoryBuyer,
  type HistoryCart,
  type HistoryOrder,
  planHistory,
} from './history-plan';
import type { SeedEnv } from './seed-env';
import { seedId } from './seed-ids';

type Db = PrismaClient;

const DEMO_BUYER_EMAILS = ['buyer1', 'buyer2', 'buyer3'].map((key) => `${key}@example.com`);

const historyBuyerEmail = (index: number): string => `history-buyer-${index + 1}@example.com`;

export interface HistorySeedResult {
  readonly orders: number;
  readonly abandonedCarts: number;
}

/**
 * Fills the last 60 days with orders, their books and carts, then adds the new seller orders to
 * the daily sales read models with one SQL aggregation. Needs `db:seed` first (stores, products,
 * buyers). Safe to repeat: rows have fixed ids, and only seller orders that were not there yet
 * are counted.
 */
export async function runHistorySeed(
  prisma: Db,
  env: SeedEnv,
  options: { now?: Date } = {},
): Promise<HistorySeedResult> {
  const now = options.now ?? (await databaseNow(prisma));
  const buyers = await ensureBuyers(prisma, env.SEED_DEMO_PASSWORD);
  const { products, sellerUserIds } = await loadCatalog(prisma);
  const plan = planHistory({
    now,
    days: HISTORY_DAYS,
    products,
    sellerUserIds,
    buyers,
    commissionRateBps: env.PLATFORM_COMMISSION_BPS,
  });

  return prisma.$transaction(
    async (tx) => {
      const known = new Set(
        (
          await tx.order.findMany({
            where: { id: { in: plan.orders.map((entry) => entry.order.id) } },
            select: { id: true },
          })
        ).map((row) => row.id),
      );
      const fresh = plan.orders.filter((entry) => !known.has(entry.order.id));
      await insertOrders(tx, fresh);
      const abandoned = await freshAbandonedCarts(tx, plan.abandonedCarts);
      await insertCarts(tx, abandoned);
      await aggregateIntoReadModels(
        tx,
        fresh.flatMap((entry) => entry.sellerOrders.map((so) => so.row.id)),
        env.ANALYTICS_TIMEZONE,
      );
      return { orders: fresh.length, abandonedCarts: abandoned.length };
    },
    { timeout: 120_000 },
  );
}

async function databaseNow(prisma: Db): Promise<Date> {
  const [{ now }] = await prisma.$queryRaw<[{ now: Date }]>`SELECT now() AS now`;
  return now;
}

/** The three demo buyers, and enough extra buyers for carts that are never checked out. */
async function ensureBuyers(prisma: Db, password: string): Promise<HistoryBuyer[]> {
  const demo = await prisma.user.findMany({
    where: { email: { in: DEMO_BUYER_EMAILS } },
    select: { id: true, email: true },
  });
  if (demo.length !== DEMO_BUYER_EMAILS.length) {
    throw new Error('Demo buyers not found: run `npm run db:seed` first');
  }
  const passwordHash = await hash(password, { type: argon2id });
  const extra = Array.from({ length: HISTORY_BUYERS }, (_, index) => ({
    id: seedId(`user:${historyBuyerEmail(index)}`),
    email: historyBuyerEmail(index),
    passwordHash,
    name: `Demo Buyer ${index + 1}`,
    roles: ['CUSTOMER' as const],
    emailVerified: true,
  }));
  await prisma.user.createMany({ data: extra, skipDuplicates: true });
  return [
    ...demo.map((user) => ({ id: user.id, key: user.email, abandonsCart: false })),
    ...extra.map((user) => ({ id: user.id, key: user.email, abandonsCart: true })),
  ];
}

async function loadCatalog(prisma: Db) {
  const [rows, sellers] = await Promise.all([
    prisma.product.findMany({
      where: {
        type: 'FIXED_PRICE',
        isPublished: true,
        archivedAt: null,
        priceCents: { not: null },
      },
      select: { id: true, sellerId: true, title: true, priceCents: true },
      orderBy: { id: 'asc' },
    }),
    prisma.sellerProfile.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, userId: true },
    }),
  ]);
  if (rows.length === 0) {
    throw new Error('No products to sell: run `npm run db:seed` first');
  }
  return {
    products: rows.map((row) => ({ ...row, priceCents: row.priceCents ?? 0 })),
    sellerUserIds: new Map(sellers.map((seller) => [seller.id, seller.userId])),
  };
}

async function insertOrders(
  tx: Prisma.TransactionClient,
  orders: readonly HistoryOrder[],
): Promise<void> {
  const sellerOrders = orders.flatMap((entry) => entry.sellerOrders);
  await tx.order.createMany({
    data: orders.map(({ order }) => ({ ...order, updatedAt: order.createdAt })),
  });
  await tx.sellerOrder.createMany({
    data: sellerOrders.map(({ row }) => ({ ...row, updatedAt: row.createdAt })),
  });
  await tx.sellerOrderItem.createMany({ data: sellerOrders.flatMap((so) => so.items) });
  await tx.sellerOrderStatusHistory.createMany({
    data: sellerOrders.flatMap((so) => so.statusHistory),
  });
  await tx.refund.createMany({ data: sellerOrders.flatMap((so) => so.refunds) });
  await tx.ledgerEntry.createMany({ data: sellerOrders.flatMap((so) => so.ledger) });
  await tx.paymentAttempt.createMany({ data: sellerOrders.map((so) => so.payment) });
  await tx.payout.createMany({
    data: sellerOrders.flatMap((so) => (so.payout === null ? [] : [so.payout])),
  });
  await insertCarts(
    tx,
    orders.map((entry) => entry.cart),
  );
}

async function insertCarts(
  tx: Prisma.TransactionClient,
  carts: readonly HistoryCart[],
): Promise<void> {
  await tx.cart.createMany({
    data: carts.map(({ cart }) => ({ ...cart, updatedAt: cart.createdAt })),
  });
  await tx.cartItem.createMany({ data: carts.flatMap((entry) => entry.items) });
}

/** A buyer keeps one open cart at most, so only carts nobody has left behind yet are added. */
async function freshAbandonedCarts(
  tx: Prisma.TransactionClient,
  carts: readonly HistoryCart[],
): Promise<HistoryCart[]> {
  const open = await tx.cart.findMany({
    where: { status: 'ACTIVE', userId: { in: carts.map((entry) => entry.cart.userId) } },
    select: { userId: true },
  });
  const taken = new Set(open.map((row) => row.userId));
  return carts.filter((entry) => !taken.has(entry.cart.userId));
}

/**
 * Adds what the new seller orders contribute to the daily read models, counting a cancelled
 * order as nothing, exactly as the analytics consumer's totals end up.
 */
async function aggregateIntoReadModels(
  tx: Prisma.TransactionClient,
  sellerOrderIds: readonly string[],
  timeZone: string,
): Promise<void> {
  if (sellerOrderIds.length === 0) {
    return;
  }
  const ids = [...sellerOrderIds];
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO sales_daily_by_seller
      (day, seller_id, orders_count, items_count, gross_cents, refunded_cents, commission_cents)
    SELECT ((so.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date AS day,
           so.seller_id,
           count(*)::int,
           coalesce(sum(i.quantity), 0)::int,
           sum(so.subtotal_cents)::int,
           sum(so.refunded_cents)::int,
           sum(so.commission_cents)::int
    FROM seller_orders so
    LEFT JOIN (
      SELECT seller_order_id, sum(quantity) AS quantity
      FROM seller_order_items GROUP BY seller_order_id
    ) i ON i.seller_order_id = so.id
    WHERE so.id = ANY(${ids}::uuid[]) AND so.status <> 'CANCELLED'
    GROUP BY 1, 2
    ON CONFLICT (day, seller_id) DO UPDATE SET
      orders_count = sales_daily_by_seller.orders_count + EXCLUDED.orders_count,
      items_count = sales_daily_by_seller.items_count + EXCLUDED.items_count,
      gross_cents = sales_daily_by_seller.gross_cents + EXCLUDED.gross_cents,
      refunded_cents = sales_daily_by_seller.refunded_cents + EXCLUDED.refunded_cents,
      commission_cents = sales_daily_by_seller.commission_cents + EXCLUDED.commission_cents`);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO sales_daily_by_product
      (day, product_id, seller_id, quantity, gross_cents, refunded_cents)
    SELECT ((so.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date AS day,
           i.product_id,
           so.seller_id,
           sum(i.quantity)::int,
           sum(i.quantity * i.unit_price_cents)::int,
           sum(i.refunded_cents)::int
    FROM seller_order_items i
    JOIN seller_orders so ON so.id = i.seller_order_id
    WHERE so.id = ANY(${ids}::uuid[]) AND so.status <> 'CANCELLED'
    GROUP BY 1, 2, 3
    ON CONFLICT (day, product_id) DO UPDATE SET
      quantity = sales_daily_by_product.quantity + EXCLUDED.quantity,
      gross_cents = sales_daily_by_product.gross_cents + EXCLUDED.gross_cents,
      refunded_cents = sales_daily_by_product.refunded_cents + EXCLUDED.refunded_cents`);
}
