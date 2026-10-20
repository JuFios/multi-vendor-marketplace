import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { runHistorySeed } from '../../prisma/seed/run-history';
import { runSeed } from '../../prisma/seed/run-seed';
import { parseSeedEnv } from '../../prisma/seed/seed-env';
import { loadEnvFiles } from '../../src/config/env-files';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createTestApp } from '../utils/test-app';

loadEnvFiles();

const NOW = new Date('2026-04-15T12:00:00Z');
const kyivDay = (at: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(at);

interface SummaryBody {
  platformRevenueCents: number;
  grossSalesCents: number;
  refundsCents: number;
  ordersCount: number;
  conversion: { cartsWithItems: number; convertedCarts: number; rate: number };
}

describe('Demo sales history (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
    await resetDb(prisma);
    const env = parseSeedEnv(process.env);
    await runSeed(prisma, env);
    first = await runHistorySeed(prisma, env, { now: NOW });
  }, 120_000);

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  let first: Awaited<ReturnType<typeof runHistorySeed>>;

  it('adds about two orders a day for 60 days, and carts left behind, without events', async () => {
    expect(first.orders).toBeGreaterThan(60);
    expect(first.orders).toBeLessThan(190);
    expect(first.abandonedCarts).toBeGreaterThan(10);
    expect(await prisma.order.count()).toBe(first.orders);
    expect(await prisma.outboxEvent.count()).toBe(0);
    const [oldest, newest] = await Promise.all([
      prisma.order.findFirstOrThrow({ orderBy: { createdAt: 'asc' } }),
      prisma.order.findFirstOrThrow({ orderBy: { createdAt: 'desc' } }),
    ]);
    expect(oldest.createdAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() - 60 * 86_400_000);
    expect(newest.createdAt.getTime()).toBeLessThan(NOW.getTime());
  });

  it('adds nothing when run again', async () => {
    const env = parseSeedEnv(process.env);
    const before = await Promise.all([
      prisma.order.count(),
      prisma.ledgerEntry.count(),
      prisma.cart.count(),
      prisma.salesDailyBySeller.aggregate({ _sum: { grossCents: true, ordersCount: true } }),
    ]);

    const again = await runHistorySeed(prisma, env, { now: NOW });

    expect(again).toEqual({ orders: 0, abandonedCarts: 0 });
    const after = await Promise.all([
      prisma.order.count(),
      prisma.ledgerEntry.count(),
      prisma.cart.count(),
      prisma.salesDailyBySeller.aggregate({ _sum: { grossCents: true, ordersCount: true } }),
    ]);
    expect(after).toEqual(before);
  });

  it('keeps the books balanced: finished seller orders net to zero, refunds and payouts agree', async () => {
    const sellerOrders = await prisma.sellerOrder.findMany({
      include: { ledgerEntries: true, refunds: true, payout: true, items: true },
    });

    for (const so of sellerOrders) {
      const net = so.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
      if (so.status === 'COMPLETED' || so.status === 'CANCELLED') {
        expect(net).toBe(0);
      }
      expect(so.refundedCents).toBe(
        so.refunds.reduce((sum, refund) => sum + refund.amountCents, 0),
      );
      expect(so.refundedCents).toBe(so.items.reduce((sum, item) => sum + item.refundedCents, 0));
      if (so.status === 'CANCELLED') {
        expect(so.commissionCents + so.payoutCents).toBe(0);
      } else {
        expect(so.payoutCents).toBe(so.subtotalCents - so.refundedCents - so.commissionCents);
      }
      expect(so.payout?.amountCents ?? so.payoutCents).toBe(so.payoutCents);
      expect(so.payout !== null).toBe(so.status === 'COMPLETED');
    }
  });

  it('agrees on orders: totals follow the parts, and every order has its converted cart', async () => {
    const orders = await prisma.order.findMany({
      include: { sellerOrders: true, carts: { include: { items: true } } },
    });

    for (const order of orders) {
      const parts = order.sellerOrders;
      const subtotal = parts.reduce((sum, so) => sum + so.subtotalCents, 0);
      const refunded = parts.reduce(
        (sum, so) => sum + (so.status === 'CANCELLED' ? so.subtotalCents : so.refundedCents),
        0,
      );
      expect(order).toMatchObject({
        subtotalCents: subtotal,
        refundedCents: refunded,
        totalCents: subtotal - refunded,
        commissionCents: parts.reduce((sum, so) => sum + so.commissionCents, 0),
      });
      expect(order.carts).toHaveLength(1);
      expect(order.carts[0]).toMatchObject({ status: 'CONVERTED', userId: order.customerId });
      const bought = parts.length;
      expect(bought).toBeGreaterThan(0);
      expect(order.carts[0]?.items.length).toBeGreaterThan(0);
    }
  });

  it('fills the read models from the same data', async () => {
    const sellerOrders = await prisma.sellerOrder.findMany({
      where: { status: { not: 'CANCELLED' } },
      include: { items: true },
    });
    const expected = new Map<
      string,
      { orders: number; gross: number; refunded: number; commission: number }
    >();
    for (const so of sellerOrders) {
      const key = `${kyivDay(so.createdAt)}|${so.sellerId}`;
      const row = expected.get(key) ?? { orders: 0, gross: 0, refunded: 0, commission: 0 };
      expected.set(key, {
        orders: row.orders + 1,
        gross: row.gross + so.subtotalCents,
        refunded: row.refunded + so.refundedCents,
        commission: row.commission + so.commissionCents,
      });
    }

    const rows = await prisma.salesDailyBySeller.findMany();

    expect(rows).toHaveLength(expected.size);
    for (const row of rows) {
      expect(expected.get(`${row.day.toISOString().slice(0, 10)}|${row.sellerId}`)).toEqual({
        orders: row.ordersCount,
        gross: row.grossCents,
        refunded: row.refundedCents,
        commission: row.commissionCents,
      });
    }
    const byProduct = await prisma.salesDailyByProduct.aggregate({
      _sum: { grossCents: true, refundedCents: true },
    });
    const bySeller = await prisma.salesDailyBySeller.aggregate({
      _sum: { grossCents: true, refundedCents: true },
    });
    expect(byProduct._sum).toEqual(bySeller._sum);
  });

  it('shows up in the admin analytics with a sensible conversion', async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { roles: { has: 'ADMIN' } } });

    const response = await request(app.getHttpServer())
      .get('/api/admin/analytics/summary?from=2026-01-01&to=2026-12-31')
      .set('Authorization', await bearerFor(app, { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] }));

    expect(response.status).toBe(200);
    const body = response.body as SummaryBody;
    const sellerOrders = await prisma.sellerOrder.findMany({
      where: { status: { not: 'CANCELLED' } },
    });
    expect(body.ordersCount).toBe(sellerOrders.length);
    expect(body.platformRevenueCents).toBe(
      sellerOrders.reduce((sum, so) => sum + so.commissionCents, 0),
    );
    expect(body.conversion.rate).toBeGreaterThan(0.4);
    expect(body.conversion.rate).toBeLessThan(0.95);
    expect(body.conversion.convertedCarts).toBe(first.orders);
  });
});
