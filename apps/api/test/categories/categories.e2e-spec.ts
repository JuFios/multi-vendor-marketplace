import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createCategory, createProduct, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface CategoryBody {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

interface ErrorBody {
  error: { code: string };
}

describe('categories (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let adminAuthorization: string;
  let customerAuthorization: string;

  const http = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', adminAuthorization);

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });
    const customer = await createUser(prisma);
    adminAuthorization = await bearerFor(app, { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] });
    customerAuthorization = await bearerFor(app, { id: customer.id });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  describe('GET /api/categories', () => {
    it('lists every category as a flat list with parentId, without a token', async () => {
      const parent = await createCategory(prisma, { name: 'Books', slug: 'books' });
      await createCategory(prisma, { name: 'Comics', slug: 'comics', parentId: parent.id });

      const res = await http().get('/api/categories').expect(200);

      expect(res.body).toEqual([
        { id: parent.id, name: 'Books', slug: 'books', parentId: null },
        expect.objectContaining({ name: 'Comics', parentId: parent.id }),
      ]);
    });
  });

  describe('admin access', () => {
    it('requires authentication', async () => {
      await http().post('/api/admin/categories').send({ name: 'A', slug: 'a' }).expect(401);
    });

    it.each([
      ['POST', '/api/admin/categories'],
      ['PATCH', '/api/admin/categories/0b0e3f0e-4d1f-4f6e-9c1a-2f4a7d9e8c10'],
      ['DELETE', '/api/admin/categories/0b0e3f0e-4d1f-4f6e-9c1a-2f4a7d9e8c10'],
    ] as const)('forbids a customer on %s %s', async (method, path) => {
      const call =
        method === 'POST'
          ? http().post(path)
          : method === 'PATCH'
            ? http().patch(path)
            : http().delete(path);

      await call.set('Authorization', customerAuthorization).send({}).expect(403);
    });
  });

  describe('POST /api/admin/categories', () => {
    it('creates a root category and a subcategory', async () => {
      const root = await asAdmin(http().post('/api/admin/categories'))
        .send({ name: '  Home & Garden ', slug: 'home-garden' })
        .expect(201);
      const child = await asAdmin(http().post('/api/admin/categories'))
        .send({ name: 'Tools', slug: 'tools', parentId: (root.body as CategoryBody).id })
        .expect(201);

      expect(root.body).toMatchObject({
        name: 'Home & Garden',
        slug: 'home-garden',
        parentId: null,
      });
      expect(child.body).toMatchObject({ parentId: (root.body as CategoryBody).id });
    });

    it('refuses a taken slug with 409 CATEGORY_SLUG_TAKEN', async () => {
      await createCategory(prisma, { slug: 'books' });

      const res = await asAdmin(http().post('/api/admin/categories'))
        .send({ name: 'Other', slug: 'books' })
        .expect(409);

      expect((res.body as ErrorBody).error.code).toBe('CATEGORY_SLUG_TAKEN');
    });

    it.each([
      ['an invalid slug', { name: 'A', slug: 'Not A Slug' }],
      ['a missing name', { slug: 'a' }],
      ['an unknown field', { name: 'A', slug: 'a', extra: 1 }],
    ])('rejects %s with 400', async (_label, body) => {
      await asAdmin(http().post('/api/admin/categories')).send(body).expect(400);
    });

    it('rejects an unknown parent', async () => {
      const res = await asAdmin(http().post('/api/admin/categories'))
        .send({ name: 'A', slug: 'a', parentId: '0b0e3f0e-4d1f-4f6e-9c1a-2f4a7d9e8c10' })
        .expect(400);

      expect((res.body as ErrorBody).error.code).toBe('CATEGORY_PARENT_INVALID');
    });
  });

  describe('PATCH /api/admin/categories/:id', () => {
    it('updates the category and records category.updated in the same transaction', async () => {
      const category = await createCategory(prisma, { name: 'Old', slug: 'old' });

      const res = await asAdmin(http().patch(`/api/admin/categories/${category.id}`))
        .send({ name: 'New' })
        .expect(200);

      expect(res.body).toMatchObject({ id: category.id, name: 'New', slug: 'old' });
      const events = await prisma.outboxEvent.findMany({
        where: { eventType: 'category.updated' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        aggregateId: category.id,
        payload: { categoryId: category.id },
      });
    });

    it('moves a category under another one and back to the root', async () => {
      const parent = await createCategory(prisma);
      const category = await createCategory(prisma);

      const moved = await asAdmin(http().patch(`/api/admin/categories/${category.id}`))
        .send({ parentId: parent.id })
        .expect(200);
      const root = await asAdmin(http().patch(`/api/admin/categories/${category.id}`))
        .send({ parentId: null })
        .expect(200);

      expect((moved.body as CategoryBody).parentId).toBe(parent.id);
      expect((root.body as CategoryBody).parentId).toBeNull();
    });

    it('refuses to place a category below itself or its descendant', async () => {
      const root = await createCategory(prisma);
      const child = await createCategory(prisma, { parentId: root.id });

      const self = await asAdmin(http().patch(`/api/admin/categories/${root.id}`))
        .send({ parentId: root.id })
        .expect(400);
      const below = await asAdmin(http().patch(`/api/admin/categories/${root.id}`))
        .send({ parentId: child.id })
        .expect(400);

      expect((self.body as ErrorBody).error.code).toBe('CATEGORY_PARENT_INVALID');
      expect((below.body as ErrorBody).error.code).toBe('CATEGORY_PARENT_INVALID');
    });

    it('refuses a taken slug and records no event', async () => {
      await createCategory(prisma, { slug: 'taken' });
      const category = await createCategory(prisma);

      const res = await asAdmin(http().patch(`/api/admin/categories/${category.id}`))
        .send({ slug: 'taken' })
        .expect(409);

      expect((res.body as ErrorBody).error.code).toBe('CATEGORY_SLUG_TAKEN');
      expect(await prisma.outboxEvent.count()).toBe(0);
    });

    it('answers 404 for an unknown category and 400 for a malformed id', async () => {
      await asAdmin(http().patch('/api/admin/categories/0b0e3f0e-4d1f-4f6e-9c1a-2f4a7d9e8c10'))
        .send({ name: 'X' })
        .expect(404);
      await asAdmin(http().patch('/api/admin/categories/not-a-uuid'))
        .send({ name: 'X' })
        .expect(400);
    });
  });

  describe('DELETE /api/admin/categories/:id', () => {
    it('deletes an unused category', async () => {
      const category = await createCategory(prisma);

      await asAdmin(http().delete(`/api/admin/categories/${category.id}`)).expect(204);

      expect(await prisma.category.count()).toBe(0);
    });

    it('answers 409 CATEGORY_IN_USE while products belong to it', async () => {
      const category = await createCategory(prisma);
      await createProduct(prisma, { categoryId: category.id });

      const res = await asAdmin(http().delete(`/api/admin/categories/${category.id}`)).expect(409);

      expect((res.body as ErrorBody).error.code).toBe('CATEGORY_IN_USE');
      expect(await prisma.category.count()).toBe(1);
    });

    it('answers 409 CATEGORY_IN_USE while it has subcategories', async () => {
      const parent = await createCategory(prisma);
      await createCategory(prisma, { parentId: parent.id });

      const res = await asAdmin(http().delete(`/api/admin/categories/${parent.id}`)).expect(409);

      expect((res.body as ErrorBody).error.code).toBe('CATEGORY_IN_USE');
    });

    it('answers 404 for an unknown category', async () => {
      await asAdmin(
        http().delete('/api/admin/categories/0b0e3f0e-4d1f-4f6e-9c1a-2f4a7d9e8c10'),
      ).expect(404);
    });
  });
});
