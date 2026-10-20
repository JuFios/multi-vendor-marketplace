import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { UserRole } from '../../src/modules/users/user-role';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface OrderBody {
  id: string;
  status: string;
  totalCents: number;
  sellerOrders: {
    id: string;
    orderId: string;
    seller: { id: string; name: string };
    items: { productId: string; quantity: number }[];
    statusHistory: { to: string }[];
  }[];
}

interface PageBody<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

interface SellerOrderBody {
  id: string;
  orderId: string;
  status: string;
  seller: { id: string };
  items: { productId: string }[];
}

interface ErrorBody {
  error: { code: string };
}

describe('Order reads (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(() => resetDb(prisma));

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  interface Caller {
    id: string;
    roles?: UserRole[];
    sellerId?: string;
  }

  const get = async (path: string, caller: Caller) =>
    request(app.getHttpServer())
      .get(`/api${path}`)
      .set('Authorization', await bearerFor(app, caller));

  /** Buys one unit of each product through the real checkout. */
  const buy = async (buyer: Caller, productIds: string[]): Promise<OrderBody> => {
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: productIds.map((productId) => ({ cartId: cart.id, productId, quantity: 1 })),
    });
    const response = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, buyer))
      .set('Idempotency-Key', randomUUID());
    expect(response.status).toBe(201);
    return response.body as OrderBody;
  };

  const world = async () => {
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });
    const first = await createSeller(prisma, { storeName: 'First Shop' });
    const second = await createSeller(prisma, { storeName: 'Second Shop' });
    const a = await createProduct(prisma, { sellerId: first.seller.id });
    const b = await createProduct(prisma, { sellerId: second.seller.id });
    const asSeller = (s: typeof first): Caller => ({
      id: s.user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: s.seller.id,
    });
    return {
      alice,
      bob,
      admin: { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] as UserRole[] },
      first: asSeller(first),
      second: asSeller(second),
      a,
      b,
    };
  };

  describe('customer', () => {
    it('lists only the caller’s orders, newest first, with pagination', async () => {
      const { alice, bob, a, b } = await world();
      const older = await buy(alice, [a.id]);
      const newer = await buy(alice, [a.id, b.id]);
      await buy(bob, [b.id]);

      const response = await get('/orders?page=1&limit=1', alice);

      expect(response.status).toBe(200);
      const body = response.body as PageBody<OrderBody>;
      expect(body).toMatchObject({ total: 2, page: 1, limit: 1 });
      expect(body.items.map((order) => order.id)).toEqual([newer.id]);
      const second = (await get('/orders?page=2&limit=1', alice)).body as PageBody<OrderBody>;
      expect(second.items.map((order) => order.id)).toEqual([older.id]);
    });

    it('shows an own order with its seller orders, items and history', async () => {
      const { alice, a, b, first } = await world();
      const placed = await buy(alice, [a.id, b.id]);

      const response = await get(`/orders/${placed.id}`, alice);

      expect(response.status).toBe(200);
      const body = response.body as OrderBody;
      expect(body.sellerOrders).toHaveLength(2);
      expect(body.sellerOrders.map((so) => so.seller.name).sort()).toEqual([
        'First Shop',
        'Second Shop',
      ]);
      expect(body.sellerOrders.find((so) => so.seller.id === first.sellerId)?.items).toEqual([
        expect.objectContaining({ productId: a.id, quantity: 1 }),
      ]);
      expect(body.sellerOrders.every((so) => so.statusHistory.at(0)?.to === 'NEW')).toBe(true);
    });

    it('answers 404 for someone else’s order, an unknown id, and 400 for a malformed one', async () => {
      const { alice, bob, a } = await world();
      const placed = await buy(alice, [a.id]);

      const foreign = await get(`/orders/${placed.id}`, bob);
      expect(foreign.status).toBe(404);
      expect((foreign.body as ErrorBody).error.code).toBe('ORDER_NOT_FOUND');
      expect((await get(`/orders/${randomUUID()}`, alice)).status).toBe(404);
      expect((await get('/orders/not-a-uuid', alice)).status).toBe(400);
      expect(((await get('/orders', bob)).body as PageBody<OrderBody>).total).toBe(0);
    });

    it('requires a token', async () => {
      await request(app.getHttpServer()).get('/api/orders').expect(401);
    });
  });

  describe('seller', () => {
    it('sees only the seller orders of their own store, from a multi-vendor order', async () => {
      const { alice, a, b, first, second } = await world();
      const placed = await buy(alice, [a.id, b.id]);

      const list = (await get('/seller/orders', first)).body as PageBody<SellerOrderBody>;
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({
        orderId: placed.id,
        status: 'NEW',
        seller: { id: first.sellerId },
      });
      expect(list.items[0]?.items.map((item) => item.productId)).toEqual([a.id]);
      expect(JSON.stringify(list)).not.toContain(alice.id);

      const other = (await get('/seller/orders', second)).body as PageBody<SellerOrderBody>;
      expect(other.items.map((item) => item.items[0]?.productId)).toEqual([b.id]);
    });

    it('filters by status', async () => {
      const { alice, a, first } = await world();
      await buy(alice, [a.id]);

      const none = (await get('/seller/orders?status=SHIPPED', first))
        .body as PageBody<SellerOrderBody>;
      const some = (await get('/seller/orders?status=NEW', first))
        .body as PageBody<SellerOrderBody>;

      expect([none.total, some.total]).toEqual([0, 1]);
      expect((await get('/seller/orders?status=BOGUS', first)).status).toBe(400);
    });

    it('shows an own seller order and answers 404 for another store’s', async () => {
      const { alice, a, b, first, second } = await world();
      const placed = await buy(alice, [a.id, b.id]);
      const mine = placed.sellerOrders.find((so) => so.seller.id === first.sellerId);
      const theirs = placed.sellerOrders.find((so) => so.seller.id === second.sellerId);

      const own = await get(`/seller/orders/${mine?.id}`, first);
      expect(own.status).toBe(200);
      expect(own.body).toMatchObject({ id: mine?.id, orderId: placed.id });
      const foreign = await get(`/seller/orders/${theirs?.id}`, first);
      expect(foreign.status).toBe(404);
      expect((foreign.body as ErrorBody).error.code).toBe('SELLER_ORDER_NOT_FOUND');
    });

    it('is closed to buyers who are not sellers', async () => {
      const { alice } = await world();

      expect((await get('/seller/orders', alice)).status).toBe(403);
    });
  });

  describe('admin', () => {
    it('lists all orders and shows any of them', async () => {
      const { alice, bob, admin, a, b } = await world();
      const one = await buy(alice, [a.id]);
      const two = await buy(bob, [a.id, b.id]);

      const list = (await get('/admin/orders', admin)).body as PageBody<OrderBody>;
      expect(list.total).toBe(2);
      expect(list.items.map((order) => order.id)).toEqual([two.id, one.id]);
      const filtered = (await get('/admin/orders?status=SHIPPED', admin))
        .body as PageBody<OrderBody>;
      expect(filtered.total).toBe(0);
      const shown = await get(`/admin/orders/${two.id}`, admin);
      expect(shown.status).toBe(200);
      expect((shown.body as OrderBody).sellerOrders).toHaveLength(2);
      expect((await get(`/admin/orders/${randomUUID()}`, admin)).status).toBe(404);
    });

    it('is closed to customers and sellers', async () => {
      const { alice, first } = await world();

      expect((await get('/admin/orders', alice)).status).toBe(403);
      expect((await get('/admin/orders', first)).status).toBe(403);
    });
  });
});
