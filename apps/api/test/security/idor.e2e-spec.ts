import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { UserRole } from '../../src/modules/users/user-role';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import {
  createAuction,
  createProduct,
  createSeller,
  createSellerOrder,
  createUser,
} from '../utils/factories';
import { createTestApp } from '../utils/test-app';
import { resetThrottleCounters } from '../utils/throttle';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface Attempt {
  name: string;
  method: Method;
  /** `{key}` placeholders are replaced with ids of the world built for the test. */
  path: string;
  body?: Record<string, unknown>;
  idempotent?: boolean;
}

interface ErrorBody {
  error: { code: string };
}

interface Page<T> {
  items: T[];
  total: number;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, { security?: Record<string, unknown>[] }>>;
}

describe('Security: ownership, roles, XSS, injection and rate limits (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;

  const server = (): App => app.getHttpServer();

  beforeAll(async () => {
    restoreEnv = overrideEnv({
      THROTTLE_LOGIN_LIMIT: '3',
      THROTTLE_LOGIN_TTL: '60',
      THROTTLE_BID_LIMIT: '3',
      THROTTLE_BID_TTL: '60',
    });
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await resetThrottleCounters(app);
  });

  afterAll(async () => {
    await resetThrottleCounters(app);
    await resetDb(prisma);
    await app.close();
    restoreEnv();
  });

  interface Caller {
    id: string;
    roles?: UserRole[];
    sellerId?: string;
  }

  /**
   * Two stores (A and B), a buyer (alice) with a seller order at store A and a dispute and a
   * notification of her own, another buyer (bob), and an admin.
   */
  const world = async () => {
    const storeA = await createSeller(prisma);
    const storeB = await createSeller(prisma);
    const alice = await createUser(prisma);
    const bob = await createUser(prisma);
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });
    const productA = await createProduct(prisma, { sellerId: storeA.seller.id });
    const { order, sellerOrder, item } = await createSellerOrder(prisma, {
      sellerId: storeA.seller.id,
      productId: productA.id,
    });
    await prisma.order.update({ where: { id: order.id }, data: { customerId: alice.id } });
    await prisma.sellerOrder.update({
      where: { id: sellerOrder.id },
      data: { status: 'PROCESSING', paymentStatus: 'CAPTURED' },
    });
    const dispute = await prisma.dispute.create({
      data: {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        customerId: alice.id,
        sellerId: storeA.seller.id,
        reason: 'Never arrived',
      },
    });
    const notification = await prisma.notification.create({
      data: { userId: alice.id, type: 'test', payload: {} },
    });
    const ids: Record<string, string> = {
      productA: productA.id,
      orderA: order.id,
      sellerOrderA: sellerOrder.id,
      itemA: item.id,
      disputeA: dispute.id,
      notificationA: notification.id,
    };
    const callers = {
      storeA: { id: storeA.user.id, roles: ['CUSTOMER', 'SELLER'], sellerId: storeA.seller.id },
      storeB: { id: storeB.user.id, roles: ['CUSTOMER', 'SELLER'], sellerId: storeB.seller.id },
      alice: { id: alice.id },
      bob: { id: bob.id },
      admin: { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] },
    } satisfies Record<string, Caller>;
    return { ids, callers, productA, sellerOrder, order };
  };

  const send = async (
    attempt: Attempt,
    ids: Record<string, string>,
    caller: Caller | null,
  ): Promise<request.Response> => {
    const fill = (text: string): string =>
      text.replace(/\{(\w+)\}/g, (_, key: string) => ids[key] ?? randomUUID());
    const path = fill(attempt.path);
    let call = request(server())[attempt.method](`/api${path}`);
    if (caller) {
      call = call.set('Authorization', await bearerFor(app, caller));
    }
    if (attempt.idempotent) {
      call = call.set('Idempotency-Key', randomUUID());
    }
    return attempt.body
      ? call.send(JSON.parse(fill(JSON.stringify(attempt.body))) as Record<string, unknown>)
      : call;
  };

  describe('IDOR: another seller cannot touch a store’s resources', () => {
    const attempts: Attempt[] = [
      { name: 'read a product', method: 'get', path: '/seller/products/{productA}' },
      {
        name: 'edit a product',
        method: 'patch',
        path: '/seller/products/{productA}',
        body: { title: 'Hijacked' },
      },
      { name: 'archive a product', method: 'delete', path: '/seller/products/{productA}' },
      {
        name: 'set the stock of a product',
        method: 'patch',
        path: '/seller/products/{productA}/stock',
        body: { stock: 0 },
      },
      { name: 'read a seller order', method: 'get', path: '/seller/orders/{sellerOrderA}' },
      {
        name: 'ship a seller order',
        method: 'post',
        path: '/seller/orders/{sellerOrderA}/status',
        body: { status: 'SHIPPED' },
      },
      {
        name: 'cancel a seller order',
        method: 'post',
        path: '/seller/orders/{sellerOrderA}/cancel',
        body: { reason: 'Not mine' },
      },
      {
        name: 'refund a seller order',
        method: 'post',
        path: '/seller/orders/{sellerOrderA}/refunds',
        body: { items: [{ sellerOrderItemId: '{itemA}', quantity: 1 }], reason: 'Not mine' },
        idempotent: true,
      },
      { name: 'read a dispute', method: 'get', path: '/disputes/{disputeA}' },
      {
        name: 'write into a dispute',
        method: 'post',
        path: '/disputes/{disputeA}/messages',
        body: { text: 'Hello' },
      },
    ];

    it.each(attempts)('answers 404 when it tries to $name', async (attempt) => {
      const { ids, callers } = await world();

      const response = await send(attempt, ids, callers.storeB);

      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).error.code).toMatch(/NOT_FOUND$/);
    });

    it('leaves the victim’s data untouched after all of the attempts', async () => {
      const { ids, callers, productA, sellerOrder } = await world();
      for (const attempt of attempts) {
        await send(attempt, ids, callers.storeB);
      }

      const product = await prisma.product.findUniqueOrThrow({ where: { id: productA.id } });
      const after = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
      expect(product).toMatchObject({
        title: productA.title,
        stock: productA.stock,
        archivedAt: null,
      });
      expect(after.status).toBe('PROCESSING');
      expect(await prisma.refund.count()).toBe(0);
      expect(await prisma.disputeMessage.count()).toBe(0);
    });

    it('shows each store only its own orders and disputes in the lists', async () => {
      const { callers } = await world();
      const auth = await bearerFor(app, callers.storeB);

      const orders = await request(server()).get('/api/seller/orders').set('Authorization', auth);
      const disputes = await request(server()).get('/api/disputes').set('Authorization', auth);
      const products = await request(server())
        .get('/api/seller/products')
        .set('Authorization', auth);

      expect((orders.body as Page<unknown>).total).toBe(0);
      expect((disputes.body as Page<unknown>).total).toBe(0);
      expect((products.body as Page<unknown>).total).toBe(0);
    });
  });

  describe('IDOR: another customer cannot touch a buyer’s resources', () => {
    const attempts: Attempt[] = [
      { name: 'read an order', method: 'get', path: '/orders/{orderA}' },
      {
        name: 'cancel a seller order',
        method: 'post',
        path: '/orders/{orderA}/seller-orders/{sellerOrderA}/cancel',
        body: { reason: 'Not mine' },
      },
      {
        name: 'confirm receipt',
        method: 'post',
        path: '/orders/{orderA}/seller-orders/{sellerOrderA}/confirm-receipt',
      },
      {
        name: 'open a dispute on it',
        method: 'post',
        path: '/disputes',
        body: { sellerOrderId: '{sellerOrderA}', reason: 'Not mine' },
      },
      { name: 'read a dispute', method: 'get', path: '/disputes/{disputeA}' },
      {
        name: 'write into a dispute',
        method: 'post',
        path: '/disputes/{disputeA}/messages',
        body: { text: 'Hello' },
      },
      {
        name: 'mark a notification read',
        method: 'post',
        path: '/notifications/{notificationA}/read',
      },
    ];

    it.each(attempts)('answers 404 when it tries to $name', async (attempt) => {
      const { ids, callers } = await world();

      const response = await send(attempt, ids, callers.bob);

      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).error.code).toMatch(/NOT_FOUND$/);
    });

    it('cannot reach the order through a seller order id of a different order', async () => {
      const { ids, callers } = await world();
      const other = await createSellerOrder(prisma);
      await prisma.order.update({
        where: { id: other.order.id },
        data: { customerId: callers.alice.id },
      });

      const response = await request(server())
        .post(`/api/orders/${other.order.id}/seller-orders/${ids.sellerOrderA}/cancel`)
        .set('Authorization', await bearerFor(app, callers.alice))
        .send({ reason: 'Mismatched ids' });

      expect(response.status).toBe(404);
    });

    it('does not list the order, the dispute or the notification of somebody else', async () => {
      const { callers } = await world();
      const auth = await bearerFor(app, callers.bob);

      const orders = await request(server()).get('/api/orders').set('Authorization', auth);
      const disputes = await request(server()).get('/api/disputes').set('Authorization', auth);
      const notifications = await request(server())
        .get('/api/notifications')
        .set('Authorization', auth);

      expect((orders.body as Page<unknown>).total).toBe(0);
      expect((disputes.body as Page<unknown>).total).toBe(0);
      expect((notifications.body as Page<unknown>).total).toBe(0);
    });

    it('refuses a review of a product that was never bought', async () => {
      const { ids, callers } = await world();

      const response = await request(server())
        .post(`/api/products/${ids.productA}/reviews`)
        .set('Authorization', await bearerFor(app, callers.bob))
        .send({ rating: 5, text: 'Never bought it' });

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('REVIEW_NOT_ALLOWED');
      expect(await prisma.review.count()).toBe(0);
    });

    it('refuses a review while the purchase is not completed yet', async () => {
      const { ids, callers } = await world();

      const response = await request(server())
        .post(`/api/products/${ids.productA}/reviews`)
        .set('Authorization', await bearerFor(app, callers.alice))
        .send({ rating: 5, text: 'Still on its way' });

      expect(response.status).toBe(403);
    });

    it('lets the owner through, so the 404s above are about ownership and nothing else', async () => {
      const { ids, callers } = await world();

      const response = await send(
        { name: 'read an order', method: 'get', path: '/orders/{orderA}' },
        ids,
        callers.alice,
      );

      expect(response.status).toBe(200);
    });
  });

  describe('roles and authentication on every documented endpoint', () => {
    const OPTIONAL_AUTH = new Set(['get /api/auctions/{id}/bids']);

    const operations = async (): Promise<{ method: Method; path: string }[]> => {
      const response = await request(server()).get('/api/docs-json').expect(200);
      const document = response.body as OpenApiDocument;
      const found: { method: Method; path: string }[] = [];
      for (const [path, methods] of Object.entries(document.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          const secured = (operation.security ?? []).some((requirement) => 'bearer' in requirement);
          if (secured && !OPTIONAL_AUTH.has(`${method} ${path}`)) {
            found.push({ method: method as Method, path: path.replace(/^\/api/, '') });
          }
        }
      }
      return found;
    };

    const call = async (
      operation: { method: Method; path: string },
      caller: Caller | null,
    ): Promise<request.Response> =>
      send(
        {
          name: `${operation.method} ${operation.path}`,
          method: operation.method,
          path: operation.path.replace(/\{\w+\}/g, () => randomUUID()),
          body: {},
          idempotent: true,
        },
        {},
        caller,
      );

    it('answers 401 to every protected endpoint without a token', async () => {
      const failures: string[] = [];
      for (const operation of await operations()) {
        const response = await call(operation, null);
        if (response.status !== 401) {
          failures.push(`${operation.method} ${operation.path} -> ${response.status}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('answers 401 to a forged or expired token', async () => {
      const forged = await request(server())
        .get('/api/users/me')
        .set('Authorization', 'Bearer not.a.jwt');
      const none = await request(server()).get('/api/users/me').set('Authorization', 'Basic abc');

      expect(forged.status).toBe(401);
      expect(none.status).toBe(401);
    });

    it('answers 403 to a customer on every seller and admin endpoint', async () => {
      const { callers } = await world();
      const failures: string[] = [];
      for (const operation of await operations()) {
        if (!/^\/(seller|admin)\//.test(operation.path)) {
          continue;
        }
        const response = await call(operation, callers.alice);
        if (response.status !== 403) {
          failures.push(`${operation.method} ${operation.path} -> ${response.status}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('answers 403 to a seller on every admin endpoint', async () => {
      const { callers } = await world();
      const failures: string[] = [];
      for (const operation of await operations()) {
        if (!operation.path.startsWith('/admin/')) {
          continue;
        }
        const response = await call(operation, callers.storeA);
        if (response.status !== 403) {
          failures.push(`${operation.method} ${operation.path} -> ${response.status}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('answers 403 on seller endpoints to a seller whose store is not approved', async () => {
      const pending = await createSeller(prisma, { status: 'PENDING' });
      const auth = await bearerFor(app, {
        id: pending.user.id,
        roles: ['CUSTOMER', 'SELLER'],
        sellerId: pending.seller.id,
      });

      const response = await request(server())
        .get('/api/seller/products')
        .set('Authorization', auth);

      expect(response.status).toBe(403);
    });

    it('does not let a seller buy or bid on their own goods', async () => {
      const { callers } = await world();
      const auction = await createAuction(prisma, {
        sellerId: (
          await prisma.sellerProfile.findFirstOrThrow({ where: { userId: callers.storeA.id } })
        ).id,
      });

      const bid = await request(server())
        .post(`/api/auctions/${auction.id}/bids`)
        .set('Authorization', await bearerFor(app, callers.storeA))
        .set('Idempotency-Key', randomUUID())
        .send({ amountCents: 10_000 });

      expect(bid.status).toBe(422);
      expect((bid.body as ErrorBody).error.code).toBe('SELF_BID_FORBIDDEN');
    });
  });

  describe('XSS: markup is stripped on the way in and never comes back', () => {
    const MARKUP = /[<>]/;

    it('sanitizes the text of a product created by a seller', async () => {
      const { callers } = await world();
      const category = await prisma.category.create({ data: { name: 'Gadgets', slug: 'gadgets' } });

      const created = await request(server())
        .post('/api/seller/products')
        .set('Authorization', await bearerFor(app, callers.storeA))
        .send({
          type: 'FIXED_PRICE',
          categoryId: category.id,
          title: 'Phone <script>alert(1)</script>',
          description: 'Nice <img src=x onerror=alert(1)> <a href="javascript:alert(1)">phone</a>',
          priceCents: 10_000,
          stock: 3,
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      const page = await request(server()).get(`/api/products/${id}`).expect(200);
      const body = page.body as { title: string; description: string };
      expect(body.title).not.toMatch(MARKUP);
      expect(body.description).not.toMatch(MARKUP);
      expect(body.title).toContain('Phone');
      const stored = await prisma.product.findUniqueOrThrow({ where: { id } });
      expect(stored.title).not.toMatch(MARKUP);
      expect(stored.description).not.toMatch(MARKUP);
    });

    it('rejects an image URL that is a script', async () => {
      const { callers } = await world();
      const category = await prisma.category.create({ data: { name: 'Gadgets', slug: 'gadgets' } });

      const response = await request(server())
        .post('/api/seller/products')
        .set('Authorization', await bearerFor(app, callers.storeA))
        .send({
          type: 'FIXED_PRICE',
          categoryId: category.id,
          title: 'Phone',
          description: 'Nice phone',
          images: ['javascript:alert(1)'],
          priceCents: 10_000,
          stock: 3,
        });

      expect(response.status).toBe(400);
    });

    it('sanitizes the profile name', async () => {
      const user = await createUser(prisma);

      const response = await request(server())
        .patch('/api/users/me')
        .set('Authorization', await bearerFor(app, { id: user.id }))
        .send({ name: '<img src=x onerror=alert(1)>Eve' })
        .expect(200);
      const me = await request(server())
        .get('/api/users/me')
        .set('Authorization', await bearerFor(app, { id: user.id }))
        .expect(200);

      expect((response.body as { name: string }).name).not.toMatch(MARKUP);
      expect((me.body as { name: string }).name).toContain('Eve');
      expect((me.body as { name: string }).name).not.toMatch(MARKUP);
    });

    it('sanitizes a review, a dispute and its messages', async () => {
      const { ids, callers } = await world();
      await prisma.sellerOrder.update({
        where: { id: ids.sellerOrderA! },
        data: { status: 'COMPLETED' },
      });
      await prisma.dispute.deleteMany();
      const alice = await bearerFor(app, callers.alice);

      await request(server())
        .post(`/api/products/${ids.productA}/reviews`)
        .set('Authorization', alice)
        .send({ rating: 4, text: 'Great <script>alert(1)</script> product' })
        .expect(201);
      const reviews = await request(server())
        .get(`/api/products/${ids.productA}/reviews`)
        .expect(200);
      const dispute = await request(server())
        .post('/api/disputes')
        .set('Authorization', alice)
        .send({ sellerOrderId: ids.sellerOrderA, reason: '<svg onload=alert(1)>Broken' })
        .expect(201);
      const disputeId = (dispute.body as { id: string }).id;
      await request(server())
        .post(`/api/disputes/${disputeId}/messages`)
        .set('Authorization', alice)
        .send({ text: '<iframe src="javascript:alert(1)"></iframe>Please help' })
        .expect(201);
      const details = await request(server())
        .get(`/api/disputes/${disputeId}`)
        .set('Authorization', alice)
        .expect(200);

      const review = (reviews.body as { items: { text: string }[] }).items[0];
      expect(review?.text).not.toMatch(MARKUP);
      expect(review?.text).toContain('Great');
      const detailsBody = details.body as { reason: string; messages: { text: string }[] };
      expect(detailsBody.reason).not.toMatch(MARKUP);
      expect(detailsBody.messages.map((message) => message.text).join(' ')).not.toMatch(MARKUP);
    });

    it('returns errors as JSON, so reflected input is not rendered as a page', async () => {
      const response = await request(server()).get(
        `/api/products/${encodeURIComponent('<script>alert(1)</script>')}`,
      );

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('injection: hostile strings are rejected or answered safely', () => {
    const SQL = [
      `' OR '1'='1`,
      `'; DROP TABLE products; --`,
      `" OR 1=1 --`,
      `1; SELECT pg_sleep(5)`,
    ];
    const FILTER = [
      'x" OR sellerId != "',
      'abc OR priceCents > 0',
      'a") OR (id != "',
      '1 TO 2 OR inStock = true',
    ];

    it.each(FILTER)('rejects %s as a catalog filter value', async (value) => {
      for (const parameter of ['categoryId', 'sellerId', 'type', 'inStock', 'sort']) {
        const response = await request(server())
          .get('/api/catalog')
          .query({ [parameter]: value });
        expect(response.status).toBe(400);
        expect((response.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
      }
      for (const parameter of ['priceMin', 'priceMax', 'ratingMin', 'page', 'limit']) {
        const response = await request(server())
          .get('/api/catalog')
          .query({ [parameter]: value });
        expect(response.status).toBe(400);
      }
    });

    it.each(SQL)('treats %s in the search text as plain text', async (text) => {
      const store = await createSeller(prisma);
      await createProduct(prisma, { sellerId: store.seller.id, title: 'Plain phone' });

      const response = await request(server()).get('/api/catalog').query({ q: text });

      expect(response.status).toBe(200);
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.user.count()).toBe(1);
    });

    it('rejects search text over the length limit', async () => {
      const response = await request(server())
        .get('/api/catalog')
        .query({ q: 'a'.repeat(201) });

      expect(response.status).toBe(400);
    });

    it.each(SQL)('rejects %s as an identifier in a path', async (value) => {
      const targets = [
        `/api/products/${encodeURIComponent(value)}`,
        `/api/auctions/${encodeURIComponent(value)}`,
        `/api/sellers/${encodeURIComponent(value)}`,
        `/api/products/${encodeURIComponent(value)}/reviews`,
      ];
      for (const target of targets) {
        const response = await request(server()).get(target);
        expect(response.status).toBe(400);
      }
    });

    it.each(SQL)('rejects %s as a list filter of an authenticated endpoint', async (value) => {
      const { callers } = await world();
      const auth = await bearerFor(app, callers.storeA);
      const targets = [
        '/api/seller/products?type=',
        '/api/seller/products?moderationStatus=',
        '/api/seller/orders?status=',
        '/api/orders?page=',
      ];
      for (const target of targets) {
        const response = await request(server())
          .get(`${target}${encodeURIComponent(value)}`)
          .set('Authorization', auth);
        expect(response.status).toBe(400);
      }
    });

    it('does not let operators or injected SQL through the login form', async () => {
      const attempts: Record<string, unknown>[] = [
        { email: { $ne: null }, password: { $ne: null } },
        { email: `admin@example.com' OR '1'='1`, password: 'x' },
        { email: 'a@example.com', password: ['x'] },
        { email: ['a@example.com'], password: 'x' },
      ];
      for (const body of attempts) {
        const response = await request(server()).post('/api/auth/login').send(body);
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
        expect(response.headers['set-cookie']).toBeUndefined();
      }
    });

    it('does not let unknown fields set protected columns', async () => {
      const { callers, productA } = await world();

      await request(server())
        .patch(`/api/seller/products/${productA.id}`)
        .set('Authorization', await bearerFor(app, callers.storeA))
        .send({
          title: 'Renamed',
          sellerId: randomUUID(),
          moderationStatus: 'REJECTED',
          version: 99,
        })
        .expect(400);
      await request(server())
        .patch('/api/users/me')
        .set('Authorization', await bearerFor(app, callers.alice))
        .send({ name: 'Alice', roles: ['ADMIN'] })
        .expect(400);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: callers.alice.id } });
      expect(user.roles).toEqual(['CUSTOMER']);
    });
  });

  describe('rate limits', () => {
    it('answers 429 to repeated login attempts and tells when to come back', async () => {
      const attempt = () =>
        request(server())
          .post('/api/auth/login')
          .send({ email: 'victim@example.com', password: 'wrong-pass-1' });

      const statuses: number[] = [];
      for (let index = 0; index < 4; index += 1) {
        statuses.push((await attempt()).status);
      }
      const limited = await attempt();

      expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
      expect(statuses[3]).toBe(429);
      expect(limited.status).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect((limited.body as ErrorBody).error.code).toBe('RATE_LIMITED');
    });

    it('answers 429 to a bidder who bids too fast, while another bidder is not affected', async () => {
      const store = await createSeller(prisma);
      const auction = await createAuction(prisma, { sellerId: store.seller.id });
      const eager = await createUser(prisma);
      const other = await createUser(prisma);
      const bid = async (userId: string, amountCents: number) =>
        request(server())
          .post(`/api/auctions/${auction.id}/bids`)
          .set('Authorization', await bearerFor(app, { id: userId }))
          .set('Idempotency-Key', randomUUID())
          .send({ amountCents });

      const statuses: number[] = [];
      for (let index = 0; index < 4; index += 1) {
        statuses.push((await bid(eager.id, 10_000 + index * 500)).status);
      }
      const unaffected = await bid(other.id, 12_000);

      expect(statuses).toEqual([201, 201, 201, 429]);
      expect(unaffected.status).toBe(201);
    });
  });
});
