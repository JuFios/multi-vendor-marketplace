import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface ApplicationBody {
  id: string;
  storeName: string;
  description: string | null;
  status: string;
  rejectionReason: string | null;
}

interface ErrorBody {
  error: { code: string };
}

describe('Seller applications (e2e)', () => {
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

  const apply = async (userId: string, body: object) =>
    http()
      .post('/api/sellers/applications')
      .set('Authorization', await bearerFor(app, { id: userId }))
      .send(body);

  const applyAndGet = async (userId: string, body: object): Promise<ApplicationBody> => {
    const response = await apply(userId, body);
    expect(response.status).toBe(201);
    return response.body as ApplicationBody;
  };

  describe('POST /api/sellers/applications', () => {
    it('creates a PENDING application with a trimmed, sanitized name', async () => {
      const user = await createUser(prisma);

      const response = await apply(user.id, {
        storeName: '  Corner <b>Shop</b> ',
        description: 'Handmade goods',
      });

      expect(response.status).toBe(201);
      expect(response.body as ApplicationBody).toMatchObject({
        storeName: 'Corner Shop',
        description: 'Handmade goods',
        status: 'PENDING',
        rejectionReason: null,
      });
      expect(await prisma.sellerProfile.count({ where: { userId: user.id } })).toBe(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).roles).toEqual([
        'CUSTOMER',
      ]);
    });

    it('requires authentication', async () => {
      await http().post('/api/sellers/applications').send({ storeName: 'Shop' }).expect(401);
    });

    it.each([
      ['a missing name', {}],
      ['a one-character name', { storeName: 'A' }],
      ['an over-long description', { storeName: 'Shop', description: 'x'.repeat(2001) }],
    ])('rejects %s', async (_label, body) => {
      const user = await createUser(prisma);

      const response = await apply(user.id, body);

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    });

    it('refuses a second application while the first is pending', async () => {
      const user = await createUser(prisma);
      await applyAndGet(user.id, { storeName: 'First' });

      const response = await apply(user.id, { storeName: 'Second' });

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe('SELLER_APPLICATION_EXISTS');
    });

    it('refuses a store name that is already taken', async () => {
      const { seller } = await createSeller(prisma);
      const user = await createUser(prisma);

      const response = await apply(user.id, { storeName: seller.storeName });

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe('STORE_NAME_TAKEN');
    });

    it('lets a rejected applicant re-apply, reusing the same profile', async () => {
      const user = await createUser(prisma);
      const first = await applyAndGet(user.id, { storeName: 'First try' });
      await prisma.sellerProfile.update({
        where: { id: first.id },
        data: { status: 'REJECTED', rejectionReason: 'Incomplete', moderatedAt: new Date() },
      });

      const second = await apply(user.id, { storeName: 'Second try' });

      expect(second.status).toBe(201);
      expect(second.body as ApplicationBody).toMatchObject({
        id: first.id,
        storeName: 'Second try',
        status: 'PENDING',
        rejectionReason: null,
      });
    });
  });

  describe('GET /api/sellers/applications/me', () => {
    it('shows the status and rejection reason to the applicant', async () => {
      const user = await createUser(prisma);
      const created = await applyAndGet(user.id, { storeName: 'Shop' });
      await prisma.sellerProfile.update({
        where: { id: created.id },
        data: { status: 'REJECTED', rejectionReason: 'Incomplete' },
      });

      const response = await http()
        .get('/api/sellers/applications/me')
        .set('Authorization', await bearerFor(app, { id: user.id }))
        .expect(200);

      expect(response.body as ApplicationBody).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Incomplete',
      });
    });

    it('answers 404 when the user never applied', async () => {
      const user = await createUser(prisma);

      const response = await http()
        .get('/api/sellers/applications/me')
        .set('Authorization', await bearerFor(app, { id: user.id }))
        .expect(404);

      expect((response.body as ErrorBody).error.code).toBe('SELLER_APPLICATION_NOT_FOUND');
    });

    it('requires authentication', async () => {
      await http().get('/api/sellers/applications/me').expect(401);
    });
  });

  describe('GET /api/sellers/:id', () => {
    it('serves an approved store publicly without owner data', async () => {
      const { seller, user } = await createSeller(prisma, { description: 'Hand made' });

      const response = await http().get(`/api/sellers/${seller.id}`).expect(200);

      expect(response.body).toEqual({
        id: seller.id,
        storeName: seller.storeName,
        description: 'Hand made',
        createdAt: seller.createdAt.toISOString(),
      });
      expect(JSON.stringify(response.body)).not.toContain(user.id);
    });

    it.each(['PENDING', 'REJECTED'] as const)('hides a %s store', async (status) => {
      const { seller } = await createSeller(prisma, { status });

      await http().get(`/api/sellers/${seller.id}`).expect(404);
    });

    it('answers 404 for an unknown store and 400 for a malformed id', async () => {
      await http().get('/api/sellers/6f1d3c1e-0b0a-4c55-9d0b-0b6f6a1b2c3d').expect(404);
      await http().get('/api/sellers/not-a-uuid').expect(400);
    });
  });
});
