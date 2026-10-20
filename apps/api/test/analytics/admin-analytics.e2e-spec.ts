import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { createSeller, createSellerOrder, createUser } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';

import { bookOrders } from './analytics-events';

interface SummaryBody {
  from: string;
  to: string;
  platformRevenueCents: number;
  grossSalesCents: number;
  refundsCents: number;
  ordersCount: number;
  revenueBySeller: { sellerId: string; storeName: string; [key: string]: unknown }[];
  topProducts: { productId: string; title: string; quantity: number; revenueCents: number }[];
  topSellers: { sellerId: string }[];
  conversion: { cartsWithItems: number; convertedCarts: number; rate: number };
}

interface ChartBody {
  current: { date: string; grossCents: number; commissionCents: number; ordersCount: number }[];
  previous: { date: string; grossCents: number; commissionCents: number; ordersCount: number }[];
  totals: {
    current: { grossCents: number; ordersCount: number };
    previous: { grossCents: number; ordersCount: number };
    deltaPct: { grossCents: number | null; ordersCount: number | null };
  };
}

const kyivDay = (at: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(at);
const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 3_600_000);

describe('Admin analytics (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => resetState(prisma));

  afterAll(async () => {
    await resetState(prisma);
    await app.close();
  });

  const admin = async () => bearerFor(app, { id: randomUUID(), roles: ['CUSTOMER', 'ADMIN'] });
  const get = async (path: string, authorization?: string) =>
    request(app.getHttpServer())
      .get(`/api/admin/analytics${path}`)
      .set('Authorization', authorization ?? (await admin()));

  const sellerCaller = (made: Awaited<ReturnType<typeof createSeller>>) => ({
    id: made.user.id,
    roles: ['CUSTOMER', 'SELLER'] as ('CUSTOMER' | 'SELLER')[],
    sellerId: made.seller.id,
  });

  describe('summary', () => {
    /** Store A: 100.00 (2 × 50.00) on 2 March, 30.00 on 2 March; store B: 60.00 on 5 March. */
    const world = async () => {
      const storeA = await createSeller(prisma);
      const storeB = await createSeller(prisma);
      const first = await createSellerOrder(prisma, {
        sellerId: storeA.seller.id,
        quantity: 2,
        unitPriceCents: 5_000,
        createdAt: new Date('2026-03-01T22:30:00Z'),
      });
      const second = await createSellerOrder(prisma, {
        sellerId: storeA.seller.id,
        quantity: 1,
        unitPriceCents: 3_000,
        createdAt: new Date('2026-03-02T10:00:00Z'),
      });
      const third = await createSellerOrder(prisma, {
        sellerId: storeB.seller.id,
        quantity: 3,
        unitPriceCents: 2_000,
        createdAt: new Date('2026-03-05T12:00:00Z'),
      });
      await bookOrders(app, [first, second, third]);
      return { storeA, storeB, first, second, third };
    };

    const startedCart = async (firstItemAddedAt: Date, converted: boolean) => {
      const buyer = await createUser(prisma);
      await prisma.cart.create({
        data: { userId: buyer.id, firstItemAddedAt, ...(converted ? { status: 'CONVERTED' } : {}) },
      });
    };

    it('adds up the orders of the period and ranks stores and products by revenue', async () => {
      const { storeA, storeB, first, second, third } = await world();

      const response = await get('/summary?from=2026-03-01&to=2026-03-31');

      expect(response.status).toBe(200);
      const body = response.body as SummaryBody;
      expect(body).toMatchObject({
        from: '2026-03-01',
        to: '2026-03-31',
        platformRevenueCents: 1_900,
        grossSalesCents: 19_000,
        refundsCents: 0,
        ordersCount: 3,
      });
      expect(body.revenueBySeller.map((row) => row.sellerId)).toEqual([
        storeA.seller.id,
        storeB.seller.id,
      ]);
      expect(body.revenueBySeller[0]).toMatchObject({
        storeName: storeA.seller.storeName,
        ordersCount: 2,
        itemsCount: 3,
        grossCents: 13_000,
        revenueCents: 13_000,
        commissionCents: 1_300,
        netCents: 11_700,
      });
      expect(body.topSellers.map((row) => row.sellerId)).toEqual([
        storeA.seller.id,
        storeB.seller.id,
      ]);
      expect(body.topProducts.map((row) => row.productId)).toEqual([
        first.product.id,
        third.product.id,
        second.product.id,
      ]);
      expect(body.topProducts[0]).toMatchObject({
        title: first.product.title,
        quantity: 2,
        revenueCents: 10_000,
      });
    });

    it('limits the period to the days asked for', async () => {
      const { storeB } = await world();

      const body = (await get('/summary?from=2026-03-05&to=2026-03-05')).body as SummaryBody;

      expect(body).toMatchObject({ ordersCount: 1, grossSalesCents: 6_000 });
      expect(body.revenueBySeller.map((row) => row.sellerId)).toEqual([storeB.seller.id]);
    });

    it('shows refunds and cancellations: a refund lowers revenue and commission, a cancelled order disappears', async () => {
      const { storeA, storeB, second, third } = await world();
      await prisma.sellerOrder.update({
        where: { id: second.sellerOrder.id },
        data: { status: 'SHIPPED', paymentStatus: 'CAPTURED' },
      });
      const refund = await request(app.getHttpServer())
        .post(`/api/seller/orders/${second.sellerOrder.id}/refunds`)
        .set('Authorization', await bearerFor(app, sellerCaller(storeA)))
        .set('Idempotency-Key', randomUUID())
        .send({ items: [{ sellerOrderItemId: second.item.id, quantity: 1 }], reason: 'Damaged' });
      expect(refund.status).toBe(201);
      const cancel = await request(app.getHttpServer())
        .post(`/api/seller/orders/${third.sellerOrder.id}/cancel`)
        .set('Authorization', await bearerFor(app, sellerCaller(storeB)))
        .send({ reason: 'Out of stock' });
      expect(cancel.status).toBe(200);
      await flushEvents({ app });

      const body = (await get('/summary?from=2026-03-01&to=2026-03-31')).body as SummaryBody;

      expect(body).toMatchObject({
        platformRevenueCents: 1_000,
        grossSalesCents: 13_000,
        refundsCents: 3_000,
        ordersCount: 2,
      });
      expect(body.revenueBySeller).toHaveLength(1);
      expect(body.revenueBySeller[0]).toMatchObject({
        sellerId: storeA.seller.id,
        revenueCents: 10_000,
        netCents: 9_000,
      });
    });

    it('counts conversion over carts that got their first item in the period', async () => {
      await startedCart(new Date('2026-03-10T09:00:00Z'), true);
      await startedCart(new Date('2026-03-11T09:00:00Z'), false);
      await startedCart(new Date('2026-03-12T09:00:00Z'), false);
      await startedCart(new Date('2026-02-20T09:00:00Z'), true);

      const body = (await get('/summary?from=2026-03-01&to=2026-03-31')).body as SummaryBody;

      expect(body.conversion).toEqual({ cartsWithItems: 3, convertedCarts: 1, rate: 0.3333 });
    });

    it('is empty and zero when nothing was sold', async () => {
      const body = (await get('/summary?from=2026-03-01&to=2026-03-31')).body as SummaryBody;

      expect(body).toMatchObject({
        platformRevenueCents: 0,
        ordersCount: 0,
        revenueBySeller: [],
        topProducts: [],
        topSellers: [],
        conversion: { cartsWithItems: 0, convertedCarts: 0, rate: 0 },
      });
    });

    it('defaults to the last 30 days', async () => {
      const body = (await get('/summary')).body as SummaryBody;

      expect(body.to).toBe(kyivDay(new Date()));
      expect(
        (Date.parse(`${body.to}T00:00:00Z`) - Date.parse(`${body.from}T00:00:00Z`)) / 86_400_000,
      ).toBe(29);
    });

    it.each([
      ['a day that does not exist', '?from=2026-02-30'],
      ['text that is not a day', '?to=yesterday'],
      ['a period that ends before it starts', '?from=2026-03-10&to=2026-03-01'],
      ['a period longer than a year and a day', '?from=2024-01-01&to=2026-01-01'],
    ])('rejects %s', async (_label, query) => {
      const response = await get(`/summary${query}`);

      expect(response.status).toBe(400);
    });
  });

  describe('sales chart', () => {
    it('has 30 days of the current and of the previous period, zero where nothing sold', async () => {
      const store = await createSeller(prisma);
      const yesterday = await createSellerOrder(prisma, {
        sellerId: store.seller.id,
        quantity: 1,
        unitPriceCents: 4_000,
        createdAt: hoursAgo(36),
      });
      const before = await createSellerOrder(prisma, {
        sellerId: store.seller.id,
        quantity: 1,
        unitPriceCents: 1_000,
        createdAt: hoursAgo(40 * 24),
      });
      await bookOrders(app, [yesterday, before]);

      const response = await get('/sales-chart');

      expect(response.status).toBe(200);
      const body = response.body as ChartBody;
      expect(body.current).toHaveLength(30);
      expect(body.previous).toHaveLength(30);
      expect(body.current.at(-1)?.date).toBe(kyivDay(new Date()));
      const day = body.current.find((entry) => entry.date === kyivDay(hoursAgo(36)));
      expect(day).toEqual({
        date: kyivDay(hoursAgo(36)),
        grossCents: 4_000,
        commissionCents: 400,
        ordersCount: 1,
      });
      const beforeDay = body.previous.find((entry) => entry.date === kyivDay(hoursAgo(40 * 24)));
      expect(beforeDay).toMatchObject({ grossCents: 1_000, ordersCount: 1 });
      expect(body.current.filter((entry) => entry.ordersCount === 0)).toHaveLength(29);
      expect(body.previous.at(-1)?.date).toBe(
        body.current[0] === undefined ? '' : dayBefore(body.current[0].date),
      );
      expect(body.totals.current).toMatchObject({ grossCents: 4_000, ordersCount: 1 });
      expect(body.totals.previous).toMatchObject({ grossCents: 1_000, ordersCount: 1 });
      expect(body.totals.deltaPct).toMatchObject({ grossCents: 300, ordersCount: 0 });
    });

    it('has no change to report against an empty previous period', async () => {
      const store = await createSeller(prisma);
      const recent = await createSellerOrder(prisma, {
        sellerId: store.seller.id,
        createdAt: hoursAgo(5),
      });
      await bookOrders(app, [recent]);

      const body = (await get('/sales-chart?days=7')).body as ChartBody;

      expect(body.current).toHaveLength(7);
      expect(body.previous).toHaveLength(7);
      expect(body.totals.deltaPct).toMatchObject({ grossCents: null, ordersCount: null });
    });

    it.each(['days=0', 'days=400', 'days=abc'])('rejects %s', async (query) => {
      expect((await get(`/sales-chart?${query}`)).status).toBe(400);
    });
  });

  describe('access', () => {
    it.each(['/summary', '/sales-chart'])('%s is admin-only', async (path) => {
      const store = await createSeller(prisma);

      const unauthenticated = await request(app.getHttpServer()).get(`/api/admin/analytics${path}`);
      const customer = await get(path, await bearerFor(app, { id: randomUUID() }));
      const seller = await get(path, await bearerFor(app, sellerCaller(store)));

      expect(unauthenticated.status).toBe(401);
      expect(customer.status).toBe(403);
      expect(seller.status).toBe(403);
    });
  });
});

function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
