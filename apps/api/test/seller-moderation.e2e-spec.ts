import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { OutboxService } from '../src/outbox';
import { PrismaService } from '../src/prisma';

import { bearerFor } from './utils/auth';
import { resetDb } from './utils/db';
import { createSeller, createUser } from './utils/factories';
import { createTestApp } from './utils/test-app';

interface ApplicationBody {
  id: string;
  userId: string;
  storeName: string;
  status: string;
  rejectionReason: string | null;
}

interface PageBody {
  items: ApplicationBody[];
  total: number;
  page: number;
  limit: number;
}

interface ErrorBody {
  error: { code: string };
}

describe('Seller moderation (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let adminId: string;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    adminId = (await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] })).id;
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const asAdmin = async () => bearerFor(app, { id: adminId, roles: ['CUSTOMER', 'ADMIN'] });

  const pendingApplication = async (storeName = `Store ${Math.random()}`) => {
    const { user, seller } = await createSeller(prisma, { status: 'PENDING', storeName });
    await prisma.user.update({ where: { id: user.id }, data: { roles: ['CUSTOMER'] } });
    return { user, seller };
  };

  const rolesOf = async (userId: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).roles;

  describe('access', () => {
    it('requires authentication', async () => {
      await http().get('/api/admin/seller-applications').expect(401);
    });

    it.each([
      ['a customer', ['CUSTOMER']],
      ['a seller', ['CUSTOMER', 'SELLER']],
    ] as const)('forbids %s on every moderation endpoint', async (_label, roles) => {
      const { seller } = await pendingApplication();
      const user = await createUser(prisma, { roles: [...roles] });
      const authorization = await bearerFor(app, { id: user.id, roles });
      const base = '/api/admin/seller-applications';

      await http().get(base).set('Authorization', authorization).expect(403);
      await http()
        .post(`${base}/${seller.id}/approve`)
        .set('Authorization', authorization)
        .expect(403);
      await http()
        .post(`${base}/${seller.id}/reject`)
        .set('Authorization', authorization)
        .send({ reason: 'No' })
        .expect(403);

      expect(
        (await prisma.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } })).status,
      ).toBe('PENDING');
    });
  });

  describe('GET /api/admin/seller-applications', () => {
    it('lists applications oldest first and filters by status', async () => {
      const first = await pendingApplication('First');
      await pendingApplication('Second');
      await createSeller(prisma, { status: 'APPROVED' });

      const all = (
        await http()
          .get('/api/admin/seller-applications')
          .set('Authorization', await asAdmin())
          .expect(200)
      ).body as PageBody;
      const pending = (
        await http()
          .get('/api/admin/seller-applications?status=PENDING&limit=1&page=2')
          .set('Authorization', await asAdmin())
          .expect(200)
      ).body as PageBody;

      expect(all).toMatchObject({ total: 3, page: 1, limit: 20 });
      expect(all.items[0]).toMatchObject({ id: first.seller.id, userId: first.user.id });
      expect(pending).toMatchObject({ total: 2, page: 2, limit: 1 });
      expect(pending.items.map((item) => item.storeName)).toEqual(['Second']);
    });

    it('rejects an unknown status filter', async () => {
      await http()
        .get('/api/admin/seller-applications?status=BANNED')
        .set('Authorization', await asAdmin())
        .expect(400);
    });
  });

  describe('POST /api/admin/seller-applications/:id/approve', () => {
    it('approves the application, grants the role and records seller.approved', async () => {
      const { user, seller } = await pendingApplication();

      const response = await http()
        .post(`/api/admin/seller-applications/${seller.id}/approve`)
        .set('Authorization', await asAdmin())
        .expect(200);

      expect(response.body as ApplicationBody).toMatchObject({ id: seller.id, status: 'APPROVED' });
      const stored = await prisma.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } });
      expect(stored).toMatchObject({ status: 'APPROVED', moderatedById: adminId });
      expect(stored.moderatedAt).not.toBeNull();
      expect(await rolesOf(user.id)).toEqual(['CUSTOMER', 'SELLER']);
      const events = await prisma.outboxEvent.findMany();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: 'seller.approved',
        aggregateId: seller.id,
        actorId: adminId,
        payload: { sellerId: seller.id, userId: user.id },
      });
    });

    it('changes nothing when the event cannot be recorded', async () => {
      const { user, seller } = await pendingApplication();
      jest
        .spyOn(app.get(OutboxService, { strict: false }), 'add')
        .mockRejectedValueOnce(new Error('outbox unavailable'));

      await http()
        .post(`/api/admin/seller-applications/${seller.id}/approve`)
        .set('Authorization', await asAdmin())
        .expect(500);

      expect(
        (await prisma.sellerProfile.findUniqueOrThrow({ where: { id: seller.id } })).status,
      ).toBe('PENDING');
      expect(await rolesOf(user.id)).toEqual(['CUSTOMER']);
      expect(await prisma.outboxEvent.count()).toBe(0);
    });

    it('refuses to decide an application twice', async () => {
      const { seller } = await pendingApplication();
      const url = `/api/admin/seller-applications/${seller.id}/approve`;
      await http()
        .post(url)
        .set('Authorization', await asAdmin())
        .expect(200);

      const response = await http()
        .post(url)
        .set('Authorization', await asAdmin())
        .expect(409);

      expect((response.body as ErrorBody).error.code).toBe('SELLER_APPLICATION_NOT_PENDING');
      expect(await prisma.outboxEvent.count()).toBe(1);
    });

    it('answers 404 for an unknown application and 400 for a malformed id', async () => {
      const authorization = await asAdmin();

      await http()
        .post('/api/admin/seller-applications/6f1d3c1e-0b0a-4c55-9d0b-0b6f6a1b2c3d/approve')
        .set('Authorization', authorization)
        .expect(404);
      await http()
        .post('/api/admin/seller-applications/nope/approve')
        .set('Authorization', authorization)
        .expect(400);
    });
  });

  describe('POST /api/admin/seller-applications/:id/reject', () => {
    it('rejects with a reason, keeps the role and records seller.rejected', async () => {
      const { user, seller } = await pendingApplication();

      const response = await http()
        .post(`/api/admin/seller-applications/${seller.id}/reject`)
        .set('Authorization', await asAdmin())
        .send({ reason: '  Incomplete <b>profile</b> ' })
        .expect(200);

      expect(response.body as ApplicationBody).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Incomplete profile',
      });
      expect(await rolesOf(user.id)).toEqual(['CUSTOMER']);
      const events = await prisma.outboxEvent.findMany();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: 'seller.rejected',
        actorId: adminId,
        payload: { sellerId: seller.id, userId: user.id, reason: 'Incomplete profile' },
      });
    });

    it.each([
      ['missing', {}],
      ['blank', { reason: '   ' }],
    ])('requires a reason (%s)', async (_label, body) => {
      const { seller } = await pendingApplication();

      await http()
        .post(`/api/admin/seller-applications/${seller.id}/reject`)
        .set('Authorization', await asAdmin())
        .send(body)
        .expect(400);
    });

    it('cannot reject an approved application', async () => {
      const { seller } = await createSeller(prisma);

      const response = await http()
        .post(`/api/admin/seller-applications/${seller.id}/reject`)
        .set('Authorization', await asAdmin())
        .send({ reason: 'Changed my mind' })
        .expect(409);

      expect((response.body as ErrorBody).error.code).toBe('SELLER_APPLICATION_NOT_PENDING');
    });
  });
});
