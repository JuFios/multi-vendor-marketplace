import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SellerGuard } from '../../src/modules/sellers/seller.guard';
import { SellersModule } from '../../src/modules/sellers/sellers.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor, cookieValue, refreshCookieOf } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';
import { resetThrottleCounters } from '../utils/throttle';

@Controller('seller-guard-spec')
class SellerGuardSpecController {
  @UseGuards(SellerGuard)
  @Get('area')
  area(): { ok: true } {
    return { ok: true };
  }
}

@Module({ imports: [SellersModule], controllers: [SellerGuardSpecController] })
class SellerGuardSpecModule {}

interface SessionBody {
  accessToken: string;
}

const PASSWORD = 'correct-horse-1';

describe('seller sessions and SellerGuard (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp([], { imports: [SellerGuardSpecModule], worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await resetThrottleCounters(app);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  it('gives an approved seller the SELLER role and the store id after the next refresh', async () => {
    const registered = await http()
      .post('/api/auth/register')
      .send({ email: 'maria@example.com', password: PASSWORD, name: 'Maria' })
      .expect(201);
    const customerToken = (registered.body as SessionBody).accessToken;
    const refreshCookie = refreshCookieOf(registered);
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });

    const application = await http()
      .post('/api/sellers/applications')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ storeName: 'Maria Shop' })
      .expect(201);
    const applicationId = (application.body as { id: string }).id;
    await http()
      .post(`/api/admin/seller-applications/${applicationId}/approve`)
      .set('Authorization', await bearerFor(app, { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] }))
      .expect(200);

    const refreshed = await http()
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', `rt=${cookieValue(refreshCookie)}`)
      .expect(200);

    const claims = app
      .get(JwtService)
      .decode<{ roles: string[]; sellerId?: string }>((refreshed.body as SessionBody).accessToken);
    expect(claims.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'SELLER']));
    expect(claims.sellerId).toBe(applicationId);
    expect(
      app.get(JwtService).decode<{ sellerId?: string }>(customerToken).sellerId,
    ).toBeUndefined();
  });

  describe('SellerGuard', () => {
    const area = (authorization: string) =>
      http().get('/api/seller-guard-spec/area').set('Authorization', authorization);

    it('admits a seller whose store is approved', async () => {
      const { user, seller } = await createSeller(prisma);

      await area(
        await bearerFor(app, { id: user.id, roles: user.roles, sellerId: seller.id }),
      ).expect(200);
    });

    it('turns away a token without the SELLER role', async () => {
      const { user, seller } = await createSeller(prisma);

      const res = await area(
        await bearerFor(app, { id: user.id, roles: ['CUSTOMER'], sellerId: seller.id }),
      ).expect(403);

      expect(res.body).toMatchObject({ error: { code: 'SELLER_NOT_APPROVED' } });
    });

    it('turns away a SELLER role without a store id in the token', async () => {
      const { user } = await createSeller(prisma);

      await area(await bearerFor(app, { id: user.id, roles: user.roles })).expect(403);
    });

    it.each(['PENDING', 'REJECTED'] as const)(
      'turns away a token whose store is %s in the database',
      async (status) => {
        const { user, seller } = await createSeller(prisma, { status });

        await area(
          await bearerFor(app, { id: user.id, roles: user.roles, sellerId: seller.id }),
        ).expect(403);
      },
    );

    it('stops admitting a seller as soon as the approval is withdrawn', async () => {
      const { user, seller } = await createSeller(prisma);
      const authorization = await bearerFor(app, {
        id: user.id,
        roles: user.roles,
        sellerId: seller.id,
      });
      await area(authorization).expect(200);

      await prisma.sellerProfile.update({ where: { id: seller.id }, data: { status: 'REJECTED' } });

      await area(authorization).expect(403);
    });
  });
});
