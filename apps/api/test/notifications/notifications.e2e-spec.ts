import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { CORRELATION_ID_REQUEST_HEADER } from '../../src/common/cls/correlation-id';
import type { OutboxEvent } from '../../src/generated/prisma/client';
import type { UserRole } from '../../src/modules/users/user-role';
import type { AnyDomainEvent } from '../../src/outbox/events/domain-event';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QUEUE } from '../../src/queue/queue-names';
import { QUEUE_PUBLISHER, type QueuePublisherPort } from '../../src/queue/queue-publisher.port';
import { bearerFor } from '../utils/auth';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { flushEvents, queueOf } from '../utils/flush-events';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';

interface Caller {
  id: string;
  roles?: UserRole[];
  sellerId?: string;
}

interface NotificationBody {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
}

interface PageBody {
  items: NotificationBody[];
  total: number;
  page: number;
  limit: number;
}

interface OrderBody {
  id: string;
  sellerOrders: { id: string; seller: { id: string } }[];
}

const toEvent = (row: OutboxEvent): AnyDomainEvent =>
  ({
    id: row.id,
    type: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    occurredAt: row.occurredAt.toISOString(),
    correlationId: row.correlationId,
    actorId: row.actorId,
    schemaVersion: 1,
    payload: row.payload,
  }) as unknown as AnyDomainEvent;

describe('Notifications (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => resetState(prisma));

  afterAll(async () => {
    await resetState(prisma);
    await app.close();
  });

  const call = async (method: 'get' | 'post', path: string, caller: Caller, body?: object) => {
    const req = request(app.getHttpServer())
      [method](`/api${path}`)
      .set('Authorization', await bearerFor(app, caller));
    return body === undefined ? req : req.send(body);
  };

  const inbox = async (caller: Caller): Promise<NotificationBody[]> =>
    ((await call('get', '/notifications', caller)).body as PageBody).items;

  const world = async () => {
    const buyer = await createUser(prisma);
    const store = await createSeller(prisma);
    const seller: Caller = {
      id: store.user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: store.seller.id,
    };
    const product = await createProduct(prisma, { sellerId: store.seller.id, stock: 10 });
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });
    return {
      buyer,
      seller,
      product,
      admin: { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] as UserRole[] },
    };
  };

  const checkout = async (buyer: Caller, productId: string, correlationId = randomUUID()) => {
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity: 1 } });
    const response = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, buyer))
      .set('Idempotency-Key', randomUUID())
      .set(CORRELATION_ID_REQUEST_HEADER, correlationId);
    const order = response.body as OrderBody;
    await flushEvents();
    return { order, soId: order.sellerOrders[0]?.id ?? '', correlationId };
  };

  describe('what produces them', () => {
    it('tells the seller about a new order, once, even when the event is delivered twice', async () => {
      const { buyer, seller, product } = await world();
      const { order, soId, correlationId } = await checkout(buyer, product.id);

      const created = await prisma.outboxEvent.findFirstOrThrow({
        where: { eventType: 'seller_order.created', aggregateId: soId },
      });
      await queueOf(app, QUEUE.NOTIFICATIONS).remove(created.id);
      await app
        .get<QueuePublisherPort>(QUEUE_PUBLISHER)
        .publish(QUEUE.NOTIFICATIONS, toEvent(created));
      await flushEvents();

      const mine = await inbox(seller);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        type: 'seller_order.created',
        readAt: null,
        payload: { orderId: order.id, sellerOrderId: soId, correlationId },
      });
      expect(await inbox(buyer)).toEqual([]);
      expect(await prisma.notification.count()).toBe(1);
    });

    it('tells the buyer about a status change', async () => {
      const { buyer, seller, product } = await world();
      const { soId } = await checkout(buyer, product.id);

      await call('post', `/seller/orders/${soId}/status`, seller, { status: 'PROCESSING' });
      await flushEvents();

      const items = await inbox(buyer);
      expect(items.map((item) => item.type)).toEqual(['seller_order.status_changed']);
      expect(items[0]?.payload).toMatchObject({
        sellerOrderId: soId,
        from: 'NEW',
        to: 'PROCESSING',
      });
    });

    it('tells the buyer about a refund', async () => {
      const { buyer, seller, product } = await world();
      const { soId } = await checkout(buyer, product.id);
      await call('post', `/seller/orders/${soId}/status`, seller, { status: 'PROCESSING' });
      await flushEvents();
      await prisma.notification.deleteMany();
      const item = await prisma.sellerOrderItem.findFirstOrThrow({
        where: { sellerOrderId: soId },
      });

      const refunded = await request(app.getHttpServer())
        .post(`/api/seller/orders/${soId}/refunds`)
        .set('Authorization', await bearerFor(app, seller))
        .set('Idempotency-Key', randomUUID())
        .send({ items: [{ sellerOrderItemId: item.id, quantity: 1 }], reason: 'Damaged' });
      await flushEvents();

      expect(refunded.status).toBe(201);
      const items = await inbox(buyer);
      expect(items.map((entry) => entry.type)).toEqual(['refund.created']);
      expect(items[0]?.payload).toMatchObject({
        sellerOrderId: soId,
        amountCents: item.unitPriceCents,
      });
      expect(await inbox(seller)).toEqual([]);
    });

    it('tells the buyer when the seller cancels, and not the seller themselves', async () => {
      const { buyer, seller, product } = await world();
      const { soId } = await checkout(buyer, product.id);
      await prisma.notification.deleteMany();

      await call('post', `/seller/orders/${soId}/cancel`, seller, { reason: 'Sold out' });
      await flushEvents();

      expect((await inbox(buyer)).map((item) => item.type)).toEqual(['seller_order.cancelled']);
      expect(await inbox(seller)).toEqual([]);
    });

    it('tells the seller when the buyer or an admin cancels', async () => {
      const { buyer, seller, product, admin } = await world();
      const first = await checkout(buyer, product.id);
      await call('post', `/orders/${first.order.id}/seller-orders/${first.soId}/cancel`, buyer);
      const second = await checkout(buyer, product.id);
      await call('post', `/admin/seller-orders/${second.soId}/cancel`, admin, { reason: 'Fraud' });
      await flushEvents();

      const cancelled = (await inbox(seller)).filter(
        (item) => item.type === 'seller_order.cancelled',
      );
      expect(cancelled).toHaveLength(2);
    });

    it('tells an applicant that their store was approved or rejected', async () => {
      const { admin } = await world();
      const applicants = [await createUser(prisma), await createUser(prisma)];
      const ids: string[] = [];
      for (const [index, applicant] of applicants.entries()) {
        const applied = await call('post', '/sellers/applications', applicant, {
          storeName: `Applicant store ${index}`,
        });
        ids.push((applied.body as { id: string }).id);
      }
      await call('post', `/admin/seller-applications/${ids[0]}/approve`, admin);
      await call('post', `/admin/seller-applications/${ids[1]}/reject`, admin, {
        reason: 'Incomplete',
      });
      await flushEvents();

      expect((await inbox(applicants[0] as Caller)).map((item) => item.type)).toEqual([
        'seller.approved',
      ]);
      expect((await inbox(applicants[1] as Caller)).map((item) => item.type)).toEqual([
        'seller.rejected',
      ]);
    });
  });

  describe('REST', () => {
    const seed = async (userId: string, count: number) => {
      for (let index = 0; index < count; index += 1) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'seller_order.created',
            payload: { index },
            sourceEventId: randomUUID(),
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
          },
        });
      }
    };

    it('lists only the caller’s notifications, newest first, with pagination', async () => {
      const alice = await createUser(prisma);
      const bob = await createUser(prisma);
      await seed(alice.id, 3);
      await seed(bob.id, 2);

      const page = (await call('get', '/notifications?page=1&limit=2', alice)).body as PageBody;

      expect(page).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(page.items.map((item) => item.payload.index)).toEqual([2, 1]);
      const second = (await call('get', '/notifications?page=2&limit=2', alice)).body as PageBody;
      expect(second.items.map((item) => item.payload.index)).toEqual([0]);
      await request(app.getHttpServer()).get('/api/notifications').expect(401);
    });

    it('returns only what is newer than `after`, so a reconnecting client can catch up', async () => {
      const alice = await createUser(prisma);
      const bob = await createUser(prisma);
      await seed(alice.id, 4);
      await seed(bob.id, 4);
      const after = encodeURIComponent(new Date(Date.UTC(2026, 0, 1, 0, 0, 1)).toISOString());

      const page = (await call('get', `/notifications?after=${after}`, alice)).body as PageBody;

      expect(page.total).toBe(2);
      expect(page.items.map((item) => item.payload.index)).toEqual([3, 2]);
      const none = encodeURIComponent(new Date(Date.UTC(2026, 0, 2)).toISOString());
      expect(
        ((await call('get', `/notifications?after=${none}`, alice)).body as PageBody).items,
      ).toEqual([]);
      expect((await call('get', '/notifications?after=yesterday', alice)).status).toBe(400);
    });

    it('counts unread notifications and marks one read', async () => {
      const alice = await createUser(prisma);
      await seed(alice.id, 3);
      const [first] = await inbox(alice);

      expect((await call('get', '/notifications/unread-count', alice)).body).toEqual({ count: 3 });
      const read = await call('post', `/notifications/${first?.id}/read`, alice);
      expect(read.status).toBe(200);
      expect((read.body as NotificationBody).readAt).not.toBeNull();
      const firstReadAt = (read.body as NotificationBody).readAt;
      expect((await call('get', '/notifications/unread-count', alice)).body).toEqual({ count: 2 });
      expect(
        ((await call('post', `/notifications/${first?.id}/read`, alice)).body as NotificationBody)
          .readAt,
      ).toBe(firstReadAt);
    });

    it('answers 404 for someone else’s notification and leaves it unread', async () => {
      const alice = await createUser(prisma);
      const bob = await createUser(prisma);
      await seed(alice.id, 1);
      const [theirs] = await inbox(alice);

      const response = await call('post', `/notifications/${theirs?.id}/read`, bob);

      expect(response.status).toBe(404);
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'NOTIFICATION_NOT_FOUND',
      );
      expect((await call('get', '/notifications/unread-count', alice)).body).toEqual({ count: 1 });
      expect((await call('post', `/notifications/${randomUUID()}/read`, alice)).status).toBe(404);
      expect((await call('post', '/notifications/not-a-uuid/read', alice)).status).toBe(400);
    });

    it('marks all of the caller’s notifications read and no one else’s', async () => {
      const alice = await createUser(prisma);
      const bob = await createUser(prisma);
      await seed(alice.id, 3);
      await seed(bob.id, 2);

      const response = await call('post', '/notifications/read-all', alice);

      expect(response.body).toEqual({ updated: 3 });
      expect((await call('get', '/notifications/unread-count', alice)).body).toEqual({ count: 0 });
      expect((await call('get', '/notifications/unread-count', bob)).body).toEqual({ count: 2 });
    });
  });
});
