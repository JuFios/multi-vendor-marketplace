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
});
