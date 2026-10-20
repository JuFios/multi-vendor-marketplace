import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createSellerOrder, createUser } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { createTestApp } from '../utils/test-app';

interface ErrorBody {
  error: { code: string };
}

interface DisputeBody {
  id: string;
  status: string;
  reason: string;
  messages: { authorRole: string; text: string }[];
}

interface NotificationsBody {
  items: { type: string }[];
}

describe('Disputes (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => resetDb(prisma));

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** A buyer and a store with one seller order in the given state. */
  const world = async (status: 'NEW' | 'SHIPPED' | 'COMPLETED' = 'SHIPPED') => {
    const bought = await createSellerOrder(prisma);
    await prisma.sellerOrder.update({ where: { id: bought.sellerOrder.id }, data: { status } });
    const store = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: bought.sellerOrder.sellerId },
    });
    return {
      sellerOrderId: bought.sellerOrder.id,
      buyer: await bearerFor(app, { id: bought.customer.id }),
      seller: await bearerFor(app, {
        id: store.userId,
        roles: ['CUSTOMER', 'SELLER'],
        sellerId: store.id,
      }),
    };
  };

  const stranger = async (seller = false) => {
    const user = await createUser(prisma);
    if (!seller) {
      return bearerFor(app, { id: user.id });
    }
    const store = await prisma.sellerProfile.create({
      data: { userId: user.id, storeName: 'Other', status: 'APPROVED' },
    });
    return bearerFor(app, { id: user.id, roles: ['CUSTOMER', 'SELLER'], sellerId: store.id });
  };

  const admin = async () =>
    bearerFor(app, { id: (await createUser(prisma, { roles: ['ADMIN'] })).id, roles: ['ADMIN'] });

  const open = (auth: string, sellerOrderId: string, reason = 'It never arrived') =>
    http().post('/api/disputes').set('Authorization', auth).send({ sellerOrderId, reason });

  const notificationTypes = async (auth: string) =>
    (
      (await http().get('/api/notifications').set('Authorization', auth)).body as NotificationsBody
    ).items.map((item) => item.type);

  it('lets the customer open a dispute on a shipped seller order', async () => {
    const { sellerOrderId, buyer } = await world();

    const response = await open(buyer, sellerOrderId).expect(201);

    expect(response.body).toMatchObject({
      sellerOrderId,
      status: 'OPEN',
      reason: 'It never arrived',
    });
  });

  it.each(['PROCESSING', 'COMPLETED'] as const)(
    'accepts a seller order that is %s',
    async (status) => {
      const { sellerOrderId, buyer } = await world();
      await prisma.sellerOrder.update({ where: { id: sellerOrderId }, data: { status } });

      await open(buyer, sellerOrderId).expect(201);
    },
  );

  it('refuses a seller order that was cancelled', async () => {
    const { sellerOrderId, buyer } = await world();
    await prisma.sellerOrder.update({
      where: { id: sellerOrderId },
      data: { status: 'CANCELLED' },
    });

    const response = await open(buyer, sellerOrderId).expect(409);

    expect((response.body as ErrorBody).error.code).toBe('DISPUTE_NOT_ALLOWED');
  });

  it('refuses a seller order that has not been accepted yet', async () => {
    const { sellerOrderId, buyer } = await world('NEW');

    const response = await open(buyer, sellerOrderId).expect(409);

    expect((response.body as ErrorBody).error.code).toBe('DISPUTE_NOT_ALLOWED');
  });

  it('hides the seller order from another customer and from the store', async () => {
    const { sellerOrderId, seller } = await world();

    await open(await stranger(), sellerOrderId).expect(404);
    await open(seller, sellerOrderId).expect(404);
    expect(await prisma.dispute.count()).toBe(0);
  });

  it('allows one open dispute per seller order', async () => {
    const { sellerOrderId, buyer } = await world();
    await open(buyer, sellerOrderId).expect(201);

    const response = await open(buyer, sellerOrderId).expect(409);

    expect((response.body as ErrorBody).error.code).toBe('DISPUTE_ALREADY_OPEN');
    await Promise.all([open(buyer, sellerOrderId), open(buyer, sellerOrderId)]);
    expect(await prisma.dispute.count()).toBe(1);
  });

  it('allows a new dispute once the previous one is resolved', async () => {
    const { sellerOrderId, buyer } = await world();
    await open(buyer, sellerOrderId).expect(201);
    await prisma.dispute.updateMany({ data: { status: 'RESOLVED_SELLER_FAVOR' } });

    await open(buyer, sellerOrderId).expect(201);
  });

  it('shows disputes to the customer and to the store only', async () => {
    const { sellerOrderId, buyer, seller } = await world();
    const created = await open(buyer, sellerOrderId).expect(201);
    const id = (created.body as { id: string }).id;
    const otherStore = await stranger(true);
    const otherBuyer = await stranger();

    for (const auth of [buyer, seller, await admin()]) {
      const found = await http().get(`/api/disputes/${id}`).set('Authorization', auth).expect(200);
      expect((found.body as DisputeBody).id).toBe(id);
    }
    await http().get(`/api/disputes/${id}`).set('Authorization', otherStore).expect(404);
    await http().get(`/api/disputes/${id}`).set('Authorization', otherBuyer).expect(404);

    const listed = (auth: string) => http().get('/api/disputes').set('Authorization', auth);
    expect(((await listed(buyer)).body as { total: number }).total).toBe(1);
    expect(((await listed(seller)).body as { total: number }).total).toBe(1);
    expect(((await listed(otherStore)).body as { total: number }).total).toBe(0);
    expect(((await listed(otherBuyer)).body as { total: number }).total).toBe(0);
  });

  it('collects messages from all three parties in order', async () => {
    const { sellerOrderId, buyer, seller } = await world();
    const id = ((await open(buyer, sellerOrderId)).body as { id: string }).id;
    const post = (auth: string, text: string) =>
      http().post(`/api/disputes/${id}/messages`).set('Authorization', auth).send({ text });

    await post(buyer, 'Where is it?').expect(201);
    await post(seller, 'It was sent').expect(201);
    await post(await admin(), 'Looking into it').expect(201);
    await post(await stranger(), 'Hello').expect(404);

    const details = await http().get(`/api/disputes/${id}`).set('Authorization', buyer).expect(200);
    expect((details.body as DisputeBody).messages.map((m) => [m.authorRole, m.text])).toEqual([
      ['CUSTOMER', 'Where is it?'],
      ['SELLER', 'It was sent'],
      ['ADMIN', 'Looking into it'],
    ]);
  });

  it('refuses messages once the dispute is resolved', async () => {
    const { sellerOrderId, buyer } = await world();
    const id = ((await open(buyer, sellerOrderId)).body as { id: string }).id;
    await prisma.dispute.update({ where: { id }, data: { status: 'RESOLVED_BUYER_FAVOR' } });

    const response = await http()
      .post(`/api/disputes/${id}/messages`)
      .set('Authorization', buyer)
      .send({ text: 'Too late' })
      .expect(409);

    expect((response.body as ErrorBody).error.code).toBe('DISPUTE_CLOSED');
  });

  it('notifies the other side of the dispute', async () => {
    const { sellerOrderId, buyer, seller } = await world();
    const id = ((await open(buyer, sellerOrderId)).body as { id: string }).id;
    await http()
      .post(`/api/disputes/${id}/messages`)
      .set('Authorization', buyer)
      .send({ text: 'Hello' })
      .expect(201);
    await http()
      .post(`/api/disputes/${id}/messages`)
      .set('Authorization', seller)
      .send({ text: 'Hi' })
      .expect(201);
    await flushEvents();

    expect(await notificationTypes(seller)).toEqual(
      expect.arrayContaining(['dispute.opened', 'dispute.message_added']),
    );
    expect(await notificationTypes(buyer)).toEqual(['dispute.message_added']);
  });

  it('validates the input and strips markup', async () => {
    const { sellerOrderId, buyer } = await world();

    await open(buyer, sellerOrderId, '   ').expect(400);
    await http()
      .post('/api/disputes')
      .set('Authorization', buyer)
      .send({ reason: 'x' })
      .expect(400);
    await http().post('/api/disputes').send({ sellerOrderId, reason: 'x' }).expect(401);
    const response = await open(
      buyer,
      sellerOrderId,
      'Broken <script>alert(1)</script> item',
    ).expect(201);

    expect((response.body as DisputeBody).reason).toBe('Broken  item');
  });
});
