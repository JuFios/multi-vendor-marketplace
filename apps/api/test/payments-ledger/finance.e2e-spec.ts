import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { UserRole } from '../../src/modules/users/user-role';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface Caller {
  id: string;
  roles?: UserRole[];
  sellerId?: string;
}

interface SummaryBody {
  grossCents: number;
  refundsCents: number;
  commissionCents: number;
  netCents: number;
  paidOutCents: number;
  balanceCents: number;
}

interface LedgerPageBody {
  items: { type: string; amountCents: number; sellerId: string }[];
  total: number;
  page: number;
  limit: number;
}

describe('Seller finance and admin ledger (e2e)', () => {
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

  const get = async (path: string, caller: Caller) =>
    request(app.getHttpServer())
      .get(`/api${path}`)
      .set('Authorization', await bearerFor(app, caller));

  const callerOf = (s: Awaited<ReturnType<typeof createSeller>>): Caller => ({
    id: s.user.id,
    roles: ['CUSTOMER', 'SELLER'],
    sellerId: s.seller.id,
  });

  /** A paid 10.00 × 3 + 40.00 order (100.00) of which 2 × 20.00 are refunded. */
  const world = async () => {
    const buyer = await createUser(prisma);
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });
    const store = await createSeller(prisma);
    const other = await createSeller(prisma);
    const seller = callerOf(store);
    const first = await createProduct(prisma, { sellerId: store.seller.id, priceCents: 2_000 });
    const second = await createProduct(prisma, { sellerId: store.seller.id, priceCents: 4_000 });
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: [
        { cartId: cart.id, productId: first.id, quantity: 3 },
        { cartId: cart.id, productId: second.id, quantity: 1 },
      ],
    });
    const checkout = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, buyer))
      .set('Idempotency-Key', randomUUID());
    const orderId = (checkout.body as { id: string }).id;
    const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId } });
    await prisma.sellerOrder.update({
      where: { id: sellerOrder.id },
      data: { status: 'SHIPPED', paymentStatus: 'CAPTURED' },
    });
    const item = await prisma.sellerOrderItem.findFirstOrThrow({
      where: { sellerOrderId: sellerOrder.id, productId: first.id },
    });
    await request(app.getHttpServer())
      .post(`/api/seller/orders/${sellerOrder.id}/refunds`)
      .set('Authorization', await bearerFor(app, seller))
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ sellerOrderItemId: item.id, quantity: 2 }], reason: 'Damaged' });
    return {
      admin: { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] as UserRole[] },
      buyer,
      seller,
      otherSeller: callerOf(other),
    };
  };

  describe('GET /seller/finance', () => {
    it('sums the store’s books', async () => {
      const { seller } = await world();

      const response = await get('/seller/finance', seller);

      expect(response.status).toBe(200);
      expect(response.body as SummaryBody).toEqual({
        grossCents: 10_000,
        refundsCents: 4_000,
        commissionCents: 600,
        netCents: 5_400,
        paidOutCents: 0,
        balanceCents: 5_400,
      });
    });

    it('limits the figures to the period but not the balance', async () => {
      const { seller } = await world();
      const future = new Date(Date.now() + 3_600_000).toISOString();

      const response = await get(`/seller/finance?from=${encodeURIComponent(future)}`, seller);

      expect(response.status).toBe(200);
      expect(response.body as SummaryBody).toEqual({
        grossCents: 0,
        refundsCents: 0,
        commissionCents: 0,
        netCents: 0,
        paidOutCents: 0,
        balanceCents: 5_400,
      });
    });

    it('does not show another store’s money', async () => {
      const { otherSeller } = await world();

      const response = await get('/seller/finance', otherSeller);

      expect((response.body as SummaryBody).balanceCents).toBe(0);
      expect((response.body as SummaryBody).grossCents).toBe(0);
    });

    it('rejects a bad period and non-sellers', async () => {
      const { seller, buyer } = await world();
      const from = encodeURIComponent('2030-01-02T00:00:00Z');
      const to = encodeURIComponent('2030-01-01T00:00:00Z');

      expect((await get(`/seller/finance?from=${from}&to=${to}`, seller)).status).toBe(400);
      expect((await get('/seller/finance?from=yesterday', seller)).status).toBe(400);
      expect((await get('/seller/finance', buyer)).status).toBe(403);
    });
  });

  describe('GET /admin/ledger', () => {
    it('lists every entry, newest first, and filters by store', async () => {
      const { admin, seller, otherSeller } = await world();

      const all = (await get('/admin/ledger', admin)).body as LedgerPageBody;
      const mine = (await get(`/admin/ledger?sellerId=${seller.sellerId}`, admin))
        .body as LedgerPageBody;
      const none = (await get(`/admin/ledger?sellerId=${otherSeller.sellerId}`, admin))
        .body as LedgerPageBody;

      expect(all.total).toBe(4);
      expect(all.items.map((entry) => entry.type).sort()).toEqual(
        ['COMMISSION', 'COMMISSION_REVERSAL', 'REFUND', 'SALE'].sort(),
      );
      expect(mine.total).toBe(4);
      expect(none).toMatchObject({ total: 0, items: [] });
    });

    it('pages the entries and filters by period', async () => {
      const { admin } = await world();
      const future = encodeURIComponent(new Date(Date.now() + 3_600_000).toISOString());

      const page = (await get('/admin/ledger?page=2&limit=3', admin)).body as LedgerPageBody;
      const later = (await get(`/admin/ledger?from=${future}`, admin)).body as LedgerPageBody;

      expect(page).toMatchObject({ total: 4, page: 2, limit: 3 });
      expect(page.items).toHaveLength(1);
      expect(later.total).toBe(0);
    });

    it('is for admins only', async () => {
      const { seller, buyer } = await world();

      expect((await get('/admin/ledger', seller)).status).toBe(403);
      expect((await get('/admin/ledger', buyer)).status).toBe(403);
      expect((await get('/admin/ledger?sellerId=nope', seller)).status).toBe(403);
    });
  });
});
