import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { productsConfig } from '../../src/config/products.config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createCategory, createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface ProductBody {
  id: string;
  moderationStatus: string;
  moderationReason: string | null;
  isPublished: boolean;
  version: number;
}

interface PageBody {
  items: ProductBody[];
  total: number;
}

interface ErrorBody {
  error: { code: string };
}

describe.each([
  ['post-moderation', false],
  ['pre-moderation', true],
])('Product moderation, %s (e2e)', (_mode, premoderation) => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: string;

  beforeAll(async () => {
    app = await createTestApp([{ token: productsConfig.KEY, useValue: { premoderation } }], {
      worker: false,
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const user = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });
    admin = await bearerFor(app, { id: user.id, roles: ['CUSTOMER', 'ADMIN'] });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const submitted = async () => {
    const { user, seller } = await createSeller(prisma);
    const category = await createCategory(prisma);
    const auth = await bearerFor(app, {
      id: user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: seller.id,
    });
    const response = await http()
      .post('/api/seller/products')
      .set('Authorization', auth)
      .send({
        type: 'FIXED_PRICE',
        categoryId: category.id,
        title: 'Phone',
        description: 'A phone',
        priceCents: 1_000,
        stock: 1,
      })
      .expect(201);
    return (response.body as ProductBody).id;
  };

  const isShown = async (id: string) => (await http().get(`/api/products/${id}`)).status === 200;

  it('puts a new product in the queue and publishes it only without pre-moderation', async () => {
    const id = await submitted();

    const queue = await http().get('/api/admin/products').set('Authorization', admin).expect(200);

    expect((queue.body as PageBody).items.map((item) => item.id)).toEqual([id]);
    expect(await isShown(id)).toBe(!premoderation);
  });

  it('approves a product: it is published and product.moderated is recorded', async () => {
    const id = await submitted();

    const response = await http()
      .post(`/api/admin/products/${id}/approve`)
      .set('Authorization', admin)
      .expect(200);

    expect(response.body).toMatchObject({
      moderationStatus: 'APPROVED',
      moderationReason: null,
      isPublished: true,
      version: 1,
    });
    expect(await isShown(id)).toBe(true);
    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: id, eventType: 'product.moderated' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ productId: id, moderationStatus: 'APPROVED' });
    const queue = await http().get('/api/admin/products').set('Authorization', admin).expect(200);
    expect((queue.body as PageBody).items).toEqual([]);
  });

  it('rejects a product with a reason: it leaves the catalog even if it was live', async () => {
    const id = await submitted();

    const response = await http()
      .post(`/api/admin/products/${id}/reject`)
      .set('Authorization', admin)
      .send({ reason: 'Counterfeit goods' })
      .expect(200);

    expect(response.body).toMatchObject({
      moderationStatus: 'REJECTED',
      moderationReason: 'Counterfeit goods',
      isPublished: false,
    });
    expect(await isShown(id)).toBe(false);
  });

  it('requires a reason to reject', async () => {
    const id = await submitted();

    await http()
      .post(`/api/admin/products/${id}/reject`)
      .set('Authorization', admin)
      .send({})
      .expect(400);
  });

  it('decides a product only once', async () => {
    const id = await submitted();
    await http().post(`/api/admin/products/${id}/approve`).set('Authorization', admin).expect(200);

    const response = await http()
      .post(`/api/admin/products/${id}/reject`)
      .set('Authorization', admin)
      .send({ reason: 'Too late' })
      .expect(409);

    expect((response.body as ErrorBody).error.code).toBe('PRODUCT_NOT_PENDING');
  });

  it('answers 404 for an unknown or archived product', async () => {
    const archived = await createProduct(prisma, {
      moderationStatus: 'PENDING',
      archivedAt: new Date(),
      isPublished: false,
    });

    await http()
      .post('/api/admin/products/7f1b7c0e-5d54-4a52-9f0a-0d2b6a3c1e11/approve')
      .set('Authorization', admin)
      .expect(404);
    await http()
      .post(`/api/admin/products/${archived.id}/approve`)
      .set('Authorization', admin)
      .expect(404);
  });

  it('is limited to admins', async () => {
    const id = await submitted();
    const seller = await createSeller(prisma);
    const sellerAuth = await bearerFor(app, {
      id: seller.user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: seller.seller.id,
    });

    await http().get('/api/admin/products').expect(401);
    await http().get('/api/admin/products').set('Authorization', sellerAuth).expect(403);
    await http()
      .post(`/api/admin/products/${id}/approve`)
      .set('Authorization', sellerAuth)
      .expect(403);
  });

  describe('auction lots', () => {
    const HOUR_MS = 3_600_000;

    /** A lot submitted by a new store; the auction comes back with it. */
    const submittedLot = async () => {
      const { user, seller } = await createSeller(prisma);
      const category = await createCategory(prisma);
      const auth = await bearerFor(app, {
        id: user.id,
        roles: ['CUSTOMER', 'SELLER'],
        sellerId: seller.id,
      });
      const response = await http()
        .post('/api/seller/products')
        .set('Authorization', auth)
        .send({
          type: 'AUCTION',
          categoryId: category.id,
          title: 'Vintage camera',
          description: 'Works well',
          startPriceCents: 10_000,
          bidStepCents: 500,
          endsAt: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
        })
        .expect(201);
      const id = (response.body as ProductBody).id;
      return prisma.auction.findUniqueOrThrow({ where: { productId: id } });
    };

    const bid = async (auctionId: string, amountCents: number) => {
      const buyer = await createUser(prisma);
      return http()
        .post(`/api/auctions/${auctionId}/bids`)
        .set('Authorization', await bearerFor(app, { id: buyer.id }))
        .set('Idempotency-Key', randomUUID())
        .send({ amountCents });
    };

    const auctionEvents = (auctionId: string, eventType: string) =>
      prisma.outboxEvent.findMany({ where: { aggregateId: auctionId, eventType } });

    it('starts the clock only once the product is in the catalog', async () => {
      const auction = await submittedLot();

      expect(auction.status).toBe(premoderation ? 'PENDING' : 'ACTIVE');
      expect(await auctionEvents(auction.id, 'auction.started')).toHaveLength(
        premoderation ? 0 : 1,
      );
      const response = await bid(auction.id, 10_000);
      if (premoderation) {
        expect(response.status).toBe(422);
        expect((response.body as ErrorBody).error.code).toBe('AUCTION_NOT_ACTIVE');
      } else {
        expect(response.status).toBe(201);
      }
    });

    it('opens a waiting lot for its full length when the product is approved', async () => {
      const auction = await submittedLot();

      await http()
        .post(`/api/admin/products/${auction.productId}/approve`)
        .set('Authorization', admin)
        .expect(200);

      const after = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      expect(after.status).toBe('ACTIVE');
      expect(await auctionEvents(auction.id, 'auction.started')).toHaveLength(1);
      if (premoderation) {
        const lastsMs = after.endsAt.getTime() - Date.now();
        expect(lastsMs).toBeGreaterThan(after.durationSec * 1000 - 10_000);
        expect(after.version).toBe(auction.version + 1);
      } else {
        expect(after).toMatchObject({ endsAt: auction.endsAt, version: auction.version });
      }
      expect((await bid(auction.id, 10_000)).status).toBe(201);
    });

    it('ends a rejected lot as not sold, even with bids, and refuses later bids', async () => {
      const auction = await submittedLot();
      if (!premoderation) {
        expect((await bid(auction.id, 10_000)).status).toBe(201);
      }

      await http()
        .post(`/api/admin/products/${auction.productId}/reject`)
        .set('Authorization', admin)
        .send({ reason: 'Counterfeit goods' })
        .expect(200);

      const after = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      expect(after.status).toBe('NOT_SOLD');
      const closed = await auctionEvents(auction.id, 'auction.closed');
      expect(closed).toHaveLength(1);
      expect(closed[0]?.payload).toMatchObject({ outcome: 'NOT_SOLD', closedBy: 'MODERATION' });
      const late = await bid(auction.id, 20_000);
      expect(late.status).toBe(422);
      expect((late.body as ErrorBody).error.code).toBe('AUCTION_NOT_ACTIVE');
    });
  });
});
