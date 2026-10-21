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
  sellerId: string;
  type: string;
  title: string;
  description: string;
  priceCents: number | null;
  stock: number;
  version: number;
  moderationStatus: string;
  isPublished: boolean;
  archivedAt: string | null;
}

interface PageBody {
  items: ProductBody[];
  total: number;
}

interface ErrorBody {
  error: { code: string };
}

describe('Seller products (e2e)', () => {
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

  const http = () => request(app.getHttpServer());

  const sellerAuth = async () => {
    const { user, seller } = await createSeller(prisma);
    const auth = await bearerFor(app, {
      id: user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: seller.id,
    });
    return { user, seller, auth };
  };

  const newProduct = (categoryId: string, overrides: Record<string, unknown> = {}) => ({
    type: 'FIXED_PRICE',
    categoryId,
    title: 'Phone',
    description: 'A good phone',
    images: ['https://img.example/phone.png'],
    priceCents: 25_000,
    stock: 5,
    ...overrides,
  });

  const events = async (productId: string) =>
    prisma.outboxEvent.findMany({
      where: { aggregateId: productId },
      orderBy: { occurredAt: 'asc' },
    });

  describe('access', () => {
    it('requires authentication', async () => {
      await http().get('/api/seller/products').expect(401);
    });

    it('refuses a customer', async () => {
      const customer = await createUser(prisma);
      const category = await createCategory(prisma);

      await http()
        .post('/api/seller/products')
        .set('Authorization', await bearerFor(app, { id: customer.id }))
        .send(newProduct(category.id))
        .expect(403);
    });

    it('refuses a seller whose application is still pending', async () => {
      const { user } = await createSeller(prisma, { status: 'PENDING' });

      await http()
        .get('/api/seller/products')
        .set('Authorization', await bearerFor(app, { id: user.id }))
        .expect(403);
    });

    it('refuses a stale SELLER token once the store is no longer approved', async () => {
      const { user, seller } = await createSeller(prisma, { status: 'PENDING' });
      const auth = await bearerFor(app, {
        id: user.id,
        roles: ['CUSTOMER', 'SELLER'],
        sellerId: seller.id,
      });

      const response = await http()
        .get('/api/seller/products')
        .set('Authorization', auth)
        .expect(403);

      expect((response.body as ErrorBody).error.code).toBe('SELLER_NOT_APPROVED');
    });
  });

  describe('ownership (IDOR)', () => {
    it('answers 404 to another seller for every operation on the product', async () => {
      const owner = await sellerAuth();
      const intruder = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: owner.seller.id });
      const url = `/api/seller/products/${product.id}`;
      const auth = intruder.auth;

      await http().get(url).set('Authorization', auth).expect(404);
      await http().patch(url).set('Authorization', auth).send({ title: 'Mine now' }).expect(404);
      await http().patch(`${url}/stock`).set('Authorization', auth).send({ stock: 0 }).expect(404);
      await http().delete(url).set('Authorization', auth).expect(404);

      const untouched = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(untouched).toMatchObject({ title: product.title, stock: 10, archivedAt: null });
    });

    it('lists only the seller’s own products', async () => {
      const mine = await sellerAuth();
      const other = await sellerAuth();
      const own = await createProduct(prisma, { sellerId: mine.seller.id });
      await createProduct(prisma, { sellerId: other.seller.id });

      const response = await http()
        .get('/api/seller/products')
        .set('Authorization', mine.auth)
        .expect(200);

      const page = response.body as PageBody;
      expect(page.items.map(({ id }) => id)).toEqual([own.id]);
      expect(page.total).toBe(1);
    });
  });

  describe('create', () => {
    it('stores the product and records product.created in the same transaction', async () => {
      const { seller, auth } = await sellerAuth();
      const category = await createCategory(prisma);

      const response = await http()
        .post('/api/seller/products')
        .set('Authorization', auth)
        .send(newProduct(category.id))
        .expect(201);

      const body = response.body as ProductBody;
      expect(body).toMatchObject({
        sellerId: seller.id,
        type: 'FIXED_PRICE',
        priceCents: 25_000,
        stock: 5,
        version: 0,
        moderationStatus: 'PENDING',
        isPublished: true,
        archivedAt: null,
      });
      const recorded = await events(body.id);
      expect(recorded.map((event) => event.eventType)).toEqual(['product.created']);
      expect(recorded[0]?.payload).toEqual({ productId: body.id, version: 0 });
    });

    it('strips markup from the title and description', async () => {
      const { auth } = await sellerAuth();
      const category = await createCategory(prisma);

      const response = await http()
        .post('/api/seller/products')
        .set('Authorization', auth)
        .send(
          newProduct(category.id, {
            title: '<b>Phone</b><script>alert(1)</script>',
            description: 'Nice <img src=x onerror=alert(1)> phone',
          }),
        )
        .expect(201);

      const body = response.body as ProductBody;
      expect(body.title).toBe('Phone');
      expect(body.description).not.toMatch(/[<>]/);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: body.id } });
      expect(stored.title).toBe('Phone');
    });

    it('rejects an auction product without the terms of its first round', async () => {
      const { auth } = await sellerAuth();
      const category = await createCategory(prisma);

      const response = await http()
        .post('/api/seller/products')
        .set('Authorization', auth)
        .send({
          type: 'AUCTION',
          categoryId: category.id,
          title: 'Lot',
          description: 'A lot',
        })
        .expect(400);

      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
      expect(await prisma.product.count()).toBe(0);
    });

    it.each([
      ['a missing price', { priceCents: undefined }],
      ['a float price', { priceCents: 10.5 }],
      ['a negative stock', { stock: -1 }],
      [
        'six images',
        { images: Array.from({ length: 6 }, (_, i) => `https://img.example/${i}.png`) },
      ],
      ['a javascript: image', { images: ['javascript:alert(1)'] }],
      ['a title that is only markup', { title: '<script>alert(1)</script>' }],
      ['an unknown type', { type: 'RAFFLE' }],
    ])('rejects %s', async (_name, overrides) => {
      const { auth } = await sellerAuth();
      const category = await createCategory(prisma);

      await http()
        .post('/api/seller/products')
        .set('Authorization', auth)
        .send(newProduct(category.id, overrides))
        .expect(400);
    });

    it('rejects a category that does not exist', async () => {
      const { auth } = await sellerAuth();

      const response = await http()
        .post('/api/seller/products')
        .set('Authorization', auth)
        .send(newProduct('7f1b7c0e-5d54-4a52-9f0a-0d2b6a3c1e11'))
        .expect(400);

      expect((response.body as ErrorBody).error.code).toBe('PRODUCT_CATEGORY_INVALID');
    });
  });

  describe('update', () => {
    it('applies the change, bumps the version and records product.updated', async () => {
      const { seller, auth } = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: seller.id });

      const response = await http()
        .patch(`/api/seller/products/${product.id}`)
        .set('Authorization', auth)
        .send({ title: 'New title', priceCents: 19_900 })
        .expect(200);

      expect(response.body).toMatchObject({ title: 'New title', priceCents: 19_900, version: 1 });
      const recorded = await events(product.id);
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({ eventType: 'product.updated' });
      expect(recorded[0]?.payload).toEqual({
        productId: product.id,
        version: 1,
        changed: ['title', 'priceCents'],
      });
    });

    it('writes nothing when nothing changes', async () => {
      const { seller, auth } = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: seller.id });

      await http()
        .patch(`/api/seller/products/${product.id}`)
        .set('Authorization', auth)
        .send({ title: product.title })
        .expect(200);

      expect(await events(product.id)).toHaveLength(0);
    });

    it('refuses to change the type', async () => {
      const { seller, auth } = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: seller.id });

      await http()
        .patch(`/api/seller/products/${product.id}`)
        .set('Authorization', auth)
        .send({ type: 'AUCTION' })
        .expect(400);

      expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).type).toBe(
        'FIXED_PRICE',
      );
    });
  });

  describe('stock', () => {
    it('sets the absolute value and records product.stock_changed', async () => {
      const { seller, auth } = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: seller.id, stock: 10 });

      const response = await http()
        .patch(`/api/seller/products/${product.id}/stock`)
        .set('Authorization', auth)
        .send({ stock: 3 })
        .expect(200);

      expect(response.body).toMatchObject({ stock: 3, version: 1 });
      const recorded = await events(product.id);
      expect(recorded[0]).toMatchObject({ eventType: 'product.stock_changed' });
      expect(recorded[0]?.payload).toEqual({ productId: product.id, stock: 3, version: 1 });
    });

    it('writes at the expected version and refuses once a sale moved the product on', async () => {
      const { seller, auth } = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: seller.id, stock: 10 });
      const setStock = (body: object) =>
        http()
          .patch(`/api/seller/products/${product.id}/stock`)
          .set('Authorization', auth)
          .send(body);

      const first = await setStock({ stock: 12, expectedVersion: 0 }).expect(200);
      expect(first.body).toMatchObject({ stock: 12, version: 1 });

      // Three units sell while the seller still looks at version 1.
      await prisma.product.update({
        where: { id: product.id },
        data: { stock: 9, version: { increment: 1 } },
      });

      const stale = await setStock({ stock: 17, expectedVersion: 1 }).expect(409);
      expect((stale.body as ErrorBody).error).toMatchObject({
        code: 'PRODUCT_VERSION_CONFLICT',
        details: { stock: 9, version: 2 },
      });
      expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({
        stock: 9,
        version: 2,
      });
      expect(
        (await events(product.id)).filter((e) => e.eventType === 'product.stock_changed'),
      ).toHaveLength(1);
    });

    it('rejects a negative stock', async () => {
      const { seller, auth } = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: seller.id });

      await http()
        .patch(`/api/seller/products/${product.id}/stock`)
        .set('Authorization', auth)
        .send({ stock: -1 })
        .expect(400);
    });
  });

  describe('delete', () => {
    it('archives the product, unpublishes it and records product.archived', async () => {
      const { seller, auth } = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: seller.id });

      await http()
        .delete(`/api/seller/products/${product.id}`)
        .set('Authorization', auth)
        .expect(204);

      const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.archivedAt).not.toBeNull();
      expect(stored.isPublished).toBe(false);
      expect((await events(product.id)).map((event) => event.eventType)).toEqual([
        'product.archived',
      ]);
    });

    it('hides the archived product from the list and refuses further changes', async () => {
      const { seller, auth } = await sellerAuth();
      const product = await createProduct(prisma, { sellerId: seller.id });
      const url = `/api/seller/products/${product.id}`;
      await http().delete(url).set('Authorization', auth).expect(204);

      const list = await http().get('/api/seller/products').set('Authorization', auth).expect(200);
      expect((list.body as PageBody).items).toEqual([]);
      await http().get(url).set('Authorization', auth).expect(200);
      await http().delete(url).set('Authorization', auth).expect(404);
      await http().patch(url).set('Authorization', auth).send({ title: 'Again' }).expect(404);
      await http().patch(`${url}/stock`).set('Authorization', auth).send({ stock: 1 }).expect(404);
    });
  });

  describe('publication mode (I-13)', () => {
    it.each([
      [false, true],
      [true, false],
    ])(
      'with pre-moderation %s a new product is published: %s',
      async (premoderation, published) => {
        const second = await createTestApp(
          [{ token: productsConfig.KEY, useValue: { premoderation } }],
          { worker: false },
        );
        try {
          const { user, seller } = await createSeller(prisma);
          const category = await createCategory(prisma);

          const response = await request(second.getHttpServer())
            .post('/api/seller/products')
            .set(
              'Authorization',
              await bearerFor(second, {
                id: user.id,
                roles: ['CUSTOMER', 'SELLER'],
                sellerId: seller.id,
              }),
            )
            .send(newProduct(category.id))
            .expect(201);

          expect(response.body).toMatchObject({
            moderationStatus: 'PENDING',
            isPublished: published,
          });
        } finally {
          await second.close();
        }
      },
    );
  });
});
