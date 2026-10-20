import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { createAuction, createProduct, createSeller, createSellerOrder } from '../utils/factories';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';

import { bookOrders } from './analytics-events';

interface DashboardBody {
  from: string;
  to: string;
  revenue: {
    ordersCount: number;
    itemsCount: number;
    grossCents: number;
    refundsCents: number;
    commissionCents: number;
    netCents: number;
  };
  ordersByStatus: Record<string, number>;
  recentOrders: { id: string; sellerId?: string; seller?: { id: string } }[];
  activeLots: {
    auctionId: string;
    productId: string;
    title: string;
    currentPriceCents: number;
    bidCount: number;
    endsAt: string;
  }[];
}

describe('Seller dashboard (e2e)', () => {
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

  const caller = (made: Awaited<ReturnType<typeof createSeller>>) => ({
    id: made.user.id,
    roles: ['CUSTOMER', 'SELLER'] as ('CUSTOMER' | 'SELLER')[],
    sellerId: made.seller.id,
  });
  const dashboard = async (made: Awaited<ReturnType<typeof createSeller>>, query = '') =>
    request(app.getHttpServer())
      .get(`/api/seller/dashboard${query}`)
      .set('Authorization', await bearerFor(app, caller(made)));

  const liveLot = async (sellerId: string, overrides: { endsInMs?: number } = {}) => {
    const product = await createProduct(prisma, {
      sellerId,
      type: 'AUCTION',
      priceCents: null,
      stock: 1,
    });
    const auction = await createAuction(prisma, {
      productId: product.id,
      sellerId,
      endsAt: new Date(Date.now() + (overrides.endsInMs ?? 3_600_000)),
    });
    return { product, auction };
  };

  /**
   * Store A: 100.00 on 2 March (shipped), 30.00 on 3 March (cancelled), 20.00 on 20 March.
   * Store B: 60.00 on 2 March.
   */
  const world = async () => {
    const storeA = await createSeller(prisma);
    const storeB = await createSeller(prisma);
    const make = (sellerId: string, unitPriceCents: number, day: string) =>
      createSellerOrder(prisma, {
        sellerId,
        quantity: 1,
        unitPriceCents,
        createdAt: new Date(`${day}T10:00:00Z`),
      });
    const shipped = await make(storeA.seller.id, 10_000, '2026-03-02');
    const cancelled = await make(storeA.seller.id, 3_000, '2026-03-03');
    const later = await make(storeA.seller.id, 2_000, '2026-03-20');
    const other = await make(storeB.seller.id, 6_000, '2026-03-02');
    await prisma.sellerOrder.update({
      where: { id: shipped.sellerOrder.id },
      data: { status: 'SHIPPED' },
    });
    await prisma.sellerOrder.update({
      where: { id: cancelled.sellerOrder.id },
      data: { status: 'CANCELLED' },
    });
    await bookOrders(app, [shipped, later, other]);
    return { storeA, storeB, shipped, cancelled, later, other };
  };

  it('shows the store’s revenue for the period and nobody else’s', async () => {
    const { storeA } = await world();

    const response = await dashboard(storeA, '?from=2026-03-01&to=2026-03-31');

    expect(response.status).toBe(200);
    const body = response.body as DashboardBody;
    expect(body).toMatchObject({ from: '2026-03-01', to: '2026-03-31' });
    expect(body.revenue).toEqual({
      ordersCount: 2,
      itemsCount: 2,
      grossCents: 12_000,
      refundsCents: 0,
      commissionCents: 1_200,
      netCents: 10_800,
    });
  });

  it('limits revenue and the status counts to the period', async () => {
    const { storeA } = await world();

    const body = (await dashboard(storeA, '?from=2026-03-01&to=2026-03-10')).body as DashboardBody;

    expect(body.revenue).toMatchObject({
      ordersCount: 1,
      grossCents: 10_000,
      commissionCents: 1_000,
    });
    expect(body.ordersByStatus).toEqual({
      NEW: 0,
      PROCESSING: 0,
      SHIPPED: 1,
      COMPLETED: 0,
      CANCELLED: 1,
    });
  });

  it('counts seller orders by status', async () => {
    const { storeA } = await world();

    const body = (await dashboard(storeA, '?from=2026-03-01&to=2026-03-31')).body as DashboardBody;

    expect(body.ordersByStatus).toEqual({
      NEW: 1,
      PROCESSING: 0,
      SHIPPED: 1,
      COMPLETED: 0,
      CANCELLED: 1,
    });
  });

  it('lists the five newest of the store’s own orders, whatever the period', async () => {
    const { storeA, shipped, cancelled, later, other } = await world();

    const body = (await dashboard(storeA, '?from=2026-03-01&to=2026-03-05')).body as DashboardBody;

    expect(body.recentOrders.map((order) => order.id)).toEqual([
      later.sellerOrder.id,
      cancelled.sellerOrder.id,
      shipped.sellerOrder.id,
    ]);
    expect(body.recentOrders.map((order) => order.id)).not.toContain(other.sellerOrder.id);
  });

  it('lists only live auctions of the store, with the price, bids and end', async () => {
    const { storeA, storeB } = await world();
    const soon = await liveLot(storeA.seller.id, { endsInMs: 600_000 });
    const later = await liveLot(storeA.seller.id, { endsInMs: 7_200_000 });
    await prisma.auction.update({
      where: { id: soon.auction.id },
      data: { currentPriceCents: 12_500, bidCount: 3 },
    });
    const ended = await liveLot(storeA.seller.id);
    await prisma.auction.update({ where: { id: ended.auction.id }, data: { status: 'NOT_SOLD' } });
    const expired = await liveLot(storeA.seller.id);
    await prisma.auction.update({
      where: { id: expired.auction.id },
      data: { endsAt: new Date(Date.now() - 1_000) },
    });
    const foreign = await liveLot(storeB.seller.id);

    const body = (await dashboard(storeA)).body as DashboardBody;

    expect(body.activeLots.map((lot) => lot.auctionId)).toEqual([
      soon.auction.id,
      later.auction.id,
    ]);
    expect(body.activeLots[0]).toMatchObject({
      productId: soon.product.id,
      title: soon.product.title,
      currentPriceCents: 12_500,
      bidCount: 3,
      endsAt: soon.auction.endsAt.toISOString(),
    });
    expect(body.activeLots[1]).toMatchObject({ currentPriceCents: 10_000, bidCount: 0 });
    expect(body.activeLots.map((lot) => lot.auctionId)).not.toContain(foreign.auction.id);
  });

  it('is zero and empty for a store with no sales', async () => {
    await world();
    const fresh = await createSeller(prisma);

    const body = (await dashboard(fresh)).body as DashboardBody;

    expect(body.revenue).toEqual({
      ordersCount: 0,
      itemsCount: 0,
      grossCents: 0,
      refundsCents: 0,
      commissionCents: 0,
      netCents: 0,
    });
    expect(body.recentOrders).toEqual([]);
    expect(body.activeLots).toEqual([]);
  });

  it('rejects a bad period', async () => {
    const store = await createSeller(prisma);

    expect((await dashboard(store, '?from=2026-03-10&to=2026-03-01')).status).toBe(400);
    expect((await dashboard(store, '?from=soon')).status).toBe(400);
  });

  it('is for approved sellers only', async () => {
    const unauthenticated = await request(app.getHttpServer()).get('/api/seller/dashboard');
    const customer = await request(app.getHttpServer())
      .get('/api/seller/dashboard')
      .set('Authorization', await bearerFor(app, { id: randomUUID() }));
    const admin = await request(app.getHttpServer())
      .get('/api/seller/dashboard')
      .set(
        'Authorization',
        await bearerFor(app, { id: randomUUID(), roles: ['CUSTOMER', 'ADMIN'] }),
      );

    expect(unauthenticated.status).toBe(401);
    expect(customer.status).toBe(403);
    expect(admin.status).toBe(403);
  });
});
