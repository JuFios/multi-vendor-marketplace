import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createCategory, createProduct, createSeller } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface StockBody {
  stock: number;
  inStock: boolean;
  version: number;
}

interface SummaryBody {
  id: string;
}

describe('Public products (e2e)', () => {
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

  const counter = async (name: string): Promise<number> => {
    const { text } = await http().get('/metrics');
    const line = text.split('\n').find((row) => row.startsWith(`${name}{cache="product"}`));
    return line === undefined ? 0 : Number(line.split(' ').at(-1));
  };

  describe('GET /api/products/:id', () => {
    it('shows a published product with its seller, category and rating, without a token', async () => {
      const { seller } = await createSeller(prisma, { storeName: 'Gadget Shop' });
      const category = await createCategory(prisma, { slug: 'phones' });
      const product = await createProduct(prisma, {
        sellerId: seller.id,
        categoryId: category.id,
        ratingCount: 2,
        ratingAvg: new Prisma.Decimal('4.5'),
      });

      const response = await http().get(`/api/products/${product.id}`).expect(200);

      expect(response.body).toMatchObject({
        id: product.id,
        priceCents: 10_000,
        stock: 10,
        inStock: true,
        rating: { average: 4.5, count: 2 },
        seller: { id: seller.id, storeName: 'Gadget Shop' },
        category: { id: category.id, slug: 'phones' },
      });
    });

    it.each([
      ['pending under pre-moderation', { moderationStatus: 'PENDING', isPublished: false }],
      ['rejected', { moderationStatus: 'REJECTED', isPublished: false }],
      ['archived', { archivedAt: new Date(), isPublished: false }],
    ] as const)('answers 404 for a product that is %s', async (_name, overrides) => {
      const product = await createProduct(prisma, overrides);

      await http().get(`/api/products/${product.id}`).expect(404);
      await http().get(`/api/products/${product.id}/stock`).expect(404);
      await http().get(`/api/products/${product.id}/similar`).expect(404);
    });

    it('answers 404 for an unknown id and 400 for a malformed one', async () => {
      await http().get('/api/products/7f1b7c0e-5d54-4a52-9f0a-0d2b6a3c1e11').expect(404);
      await http().get('/api/products/not-a-uuid').expect(400);
    });

    it('serves the second read from the cache', async () => {
      const product = await createProduct(prisma);
      const hitsBefore = await counter('cache_hits_total');
      const missesBefore = await counter('cache_misses_total');

      await http().get(`/api/products/${product.id}`).expect(200);
      await http().get(`/api/products/${product.id}`).expect(200);

      expect(await counter('cache_misses_total')).toBe(missesBefore + 1);
      expect(await counter('cache_hits_total')).toBe(hitsBefore + 1);
    });

    it('does not cache a 404', async () => {
      const product = await createProduct(prisma, { isPublished: false });
      await http().get(`/api/products/${product.id}`).expect(404);

      await prisma.product.update({ where: { id: product.id }, data: { isPublished: true } });

      await http().get(`/api/products/${product.id}`).expect(200);
    });

    it('shows the new price right after the seller changes it', async () => {
      const { user, seller } = await createSeller(prisma);
      const product = await createProduct(prisma, { sellerId: seller.id, priceCents: 10_000 });
      const auth = await bearerFor(app, {
        id: user.id,
        roles: ['CUSTOMER', 'SELLER'],
        sellerId: seller.id,
      });
      await http().get(`/api/products/${product.id}`).expect(200);

      await http()
        .patch(`/api/seller/products/${product.id}`)
        .set('Authorization', auth)
        .send({ priceCents: 7_500 })
        .expect(200);

      const response = await http().get(`/api/products/${product.id}`).expect(200);
      expect(response.body).toMatchObject({ priceCents: 7_500, version: 1 });
    });

    it('shows the new stock right after the seller changes it, and drops archived products', async () => {
      const { user, seller } = await createSeller(prisma);
      const product = await createProduct(prisma, { sellerId: seller.id, stock: 10 });
      const auth = await bearerFor(app, {
        id: user.id,
        roles: ['CUSTOMER', 'SELLER'],
        sellerId: seller.id,
      });
      await http().get(`/api/products/${product.id}`).expect(200);

      await http()
        .patch(`/api/seller/products/${product.id}/stock`)
        .set('Authorization', auth)
        .send({ stock: 0 })
        .expect(200);
      const soldOut = await http().get(`/api/products/${product.id}`).expect(200);
      await http()
        .delete(`/api/seller/products/${product.id}`)
        .set('Authorization', auth)
        .expect(204);

      expect(soldOut.body).toMatchObject({ stock: 0, inStock: false });
      await http().get(`/api/products/${product.id}`).expect(404);
    });
  });

  describe('GET /api/products/:id/stock', () => {
    it('returns the stock snapshot straight from the database', async () => {
      const product = await createProduct(prisma, { stock: 4, version: 7 });
      await http().get(`/api/products/${product.id}`).expect(200);
      await prisma.product.update({ where: { id: product.id }, data: { stock: 1, version: 8 } });

      const response = await http().get(`/api/products/${product.id}/stock`).expect(200);

      expect(response.body as StockBody).toEqual({ stock: 1, inStock: true, version: 8 });
    });
  });

  describe('GET /api/products/:id/similar', () => {
    it('lists published, in-stock products of the same category, at most 8', async () => {
      const category = await createCategory(prisma);
      const other = await createCategory(prisma);
      const product = await createProduct(prisma, { categoryId: category.id });
      const similar = await Promise.all(
        Array.from({ length: 9 }, () => createProduct(prisma, { categoryId: category.id })),
      );
      await createProduct(prisma, { categoryId: category.id, stock: 0 });
      await createProduct(prisma, { categoryId: category.id, isPublished: false });
      await createProduct(prisma, {
        categoryId: category.id,
        archivedAt: new Date(),
        isPublished: false,
      });
      await createProduct(prisma, { categoryId: other.id });

      const response = await http().get(`/api/products/${product.id}/similar`).expect(200);

      const ids = (response.body as SummaryBody[]).map(({ id }) => id);
      expect(ids).toHaveLength(8);
      expect(ids).not.toContain(product.id);
      expect(ids.every((id) => similar.some((item) => item.id === id))).toBe(true);
    });
  });
});
