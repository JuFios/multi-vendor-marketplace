import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { UserRole } from '../../src/modules/users';
import { PrismaService } from '../../src/prisma';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface OrderBody {
  id: string;
  status: string;
  hasCancelledParts: boolean;
  sellerOrders: { id: string; seller: { id: string } }[];
}

interface SellerOrderBody {
  id: string;
  status: string;
  statusHistory: { from: string | null; to: string; actor: string }[];
}

interface ErrorBody {
  error: { code: string };
}

describe('Seller order status flow (e2e)', () => {
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

  interface Caller {
    id: string;
    roles?: UserRole[];
    sellerId?: string;
  }

  const post = async (path: string, caller: Caller, body?: object) => {
    const req = request(app.getHttpServer())
      .post(`/api${path}`)
      .set('Authorization', await bearerFor(app, caller));
    return body === undefined ? req : req.send(body);
  };

  const ok = async (pending: Promise<{ status: number }>): Promise<void> => {
    expect((await pending).status).toBe(200);
  };

  const orderStatus = async (id: string) =>
    prisma.order.findUniqueOrThrow({ where: { id } }).then((order) => order.status);

  const world = async () => {
    const buyer = await createUser(prisma);
    const other = await createUser(prisma);
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });
    const first = await createSeller(prisma);
    const second = await createSeller(prisma);
    const a = await createProduct(prisma, { sellerId: first.seller.id });
    const b = await createProduct(prisma, { sellerId: second.seller.id });
    const asSeller = (s: typeof first): Caller => ({
      id: s.user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: s.seller.id,
    });
    return {
      buyer,
      other,
      admin: { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] as UserRole[] },
      first: asSeller(first),
      second: asSeller(second),
      a,
      b,
    };
  };

  /** A two-seller order bought through checkout, with both payments captured. */
  const placeOrder = async (buyer: Caller, productIds: string[]) => {
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: productIds.map((productId) => ({ cartId: cart.id, productId, quantity: 1 })),
    });
    const response = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, buyer))
      .set('Idempotency-Key', randomUUID());
    const order = response.body as OrderBody;
    const sellerOrders = new Map(order.sellerOrders.map((so) => [so.seller.id, so.id]));
    return {
      order,
      soOf: (sellerId: string) => sellerOrders.get(sellerId)!,
      capture: () =>
        prisma.sellerOrder.updateMany({
          where: { orderId: order.id },
          data: { paymentStatus: 'CAPTURED' },
        }),
    };
  };

  it('takes a seller order from NEW to COMPLETED, and the order follows', async () => {
    const { buyer, first, a } = await world();
    const { order, soOf, capture } = await placeOrder(buyer, [a.id]);
    const so = soOf(first.sellerId!);
    await capture();

    const processing = await post(`/seller/orders/${so}/status`, first, { status: 'PROCESSING' });
    expect(processing.status).toBe(200);
    expect((processing.body as SellerOrderBody).status).toBe('PROCESSING');
    expect(await orderStatus(order.id)).toBe('PROCESSING');

    await ok(post(`/seller/orders/${so}/status`, first, { status: 'SHIPPED' }));
    expect(await orderStatus(order.id)).toBe('SHIPPED');

    const completed = await post(`/orders/${order.id}/seller-orders/${so}/confirm-receipt`, buyer);
    expect(completed.status).toBe(200);
    const body = completed.body as SellerOrderBody;
    expect(body.status).toBe('COMPLETED');
    expect(body.statusHistory.map((entry) => [entry.from, entry.to, entry.actor])).toEqual([
      [null, 'NEW', 'CUSTOMER'],
      ['NEW', 'PROCESSING', 'SELLER'],
      ['PROCESSING', 'SHIPPED', 'SELLER'],
      ['SHIPPED', 'COMPLETED', 'CUSTOMER'],
    ]);
    expect(await orderStatus(order.id)).toBe('COMPLETED');
  });

  it('aggregates independent seller orders: one shipped is partial, both shipped is shipped', async () => {
    const { buyer, first, second, a, b } = await world();
    const { order, soOf, capture } = await placeOrder(buyer, [a.id, b.id]);
    await capture();
    const [soA, soB] = [soOf(first.sellerId!), soOf(second.sellerId!)];

    await ok(post(`/seller/orders/${soA}/status`, first, { status: 'PROCESSING' }));
    expect(await orderStatus(order.id)).toBe('PROCESSING');
    await ok(post(`/seller/orders/${soA}/status`, first, { status: 'SHIPPED' }));
    expect(await orderStatus(order.id)).toBe('PARTIALLY_SHIPPED');
    await ok(post(`/seller/orders/${soB}/status`, second, { status: 'PROCESSING' }));
    await ok(post(`/seller/orders/${soB}/status`, second, { status: 'SHIPPED' }));
    expect(await orderStatus(order.id)).toBe('SHIPPED');
    await ok(post(`/orders/${order.id}/seller-orders/${soA}/confirm-receipt`, buyer));
    expect(await orderStatus(order.id)).toBe('SHIPPED');
    await ok(post(`/orders/${order.id}/seller-orders/${soB}/confirm-receipt`, buyer));
    expect(await orderStatus(order.id)).toBe('COMPLETED');
  });

  it('records status_changed per seller order and order.status_changed only when the aggregate moves', async () => {
    const { buyer, first, second, a, b } = await world();
    const { order, soOf, capture } = await placeOrder(buyer, [a.id, b.id]);
    await capture();
    await prisma.outboxEvent.deleteMany();

    await post(`/seller/orders/${soOf(first.sellerId!)}/status`, first, {
      status: 'PROCESSING',
    });
    await post(`/seller/orders/${soOf(second.sellerId!)}/status`, second, {
      status: 'PROCESSING',
    });

    const events = await prisma.outboxEvent.findMany({ orderBy: { occurredAt: 'asc' } });
    expect(events.map((event) => event.eventType)).toEqual([
      'seller_order.status_changed',
      'order.status_changed',
      'seller_order.status_changed',
    ]);
    expect(events[0]?.payload).toMatchObject({
      orderId: order.id,
      customerId: buyer.id,
      from: 'NEW',
      to: 'PROCESSING',
      version: 1,
    });
  });

  it('refuses PROCESSING until the payment is captured', async () => {
    const { buyer, first, a } = await world();
    const { soOf } = await placeOrder(buyer, [a.id]);

    const response = await post(`/seller/orders/${soOf(first.sellerId!)}/status`, first, {
      status: 'PROCESSING',
    });

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('PAYMENT_NOT_CAPTURED');
  });

  it('refuses transitions the table does not allow', async () => {
    const { buyer, first, a } = await world();
    const { order, soOf, capture } = await placeOrder(buyer, [a.id]);
    await capture();
    const so = soOf(first.sellerId!);

    const skip = await post(`/seller/orders/${so}/status`, first, { status: 'SHIPPED' });
    expect(skip.status).toBe(409);
    expect((skip.body as ErrorBody).error.code).toBe('INVALID_STATUS_TRANSITION');
    const early = await post(`/orders/${order.id}/seller-orders/${so}/confirm-receipt`, buyer);
    expect(early.status).toBe(409);
    expect((await post(`/seller/orders/${so}/status`, first, { status: 'COMPLETED' })).status).toBe(
      400,
    );
    expect((await post(`/seller/orders/${so}/status`, first, { status: 'NEW' })).status).toBe(400);
  });

  it('lets an admin complete a shipped seller order', async () => {
    const { buyer, first, admin, a } = await world();
    const { order, soOf, capture } = await placeOrder(buyer, [a.id]);
    await capture();
    const so = soOf(first.sellerId!);
    await post(`/seller/orders/${so}/status`, first, { status: 'PROCESSING' });
    await post(`/seller/orders/${so}/status`, first, { status: 'SHIPPED' });

    const response = await post(`/admin/seller-orders/${so}/status`, admin, {
      status: 'COMPLETED',
    });

    expect(response.status).toBe(200);
    expect((response.body as SellerOrderBody).statusHistory.at(-1)?.actor).toBe('ADMIN');
    expect(await orderStatus(order.id)).toBe('COMPLETED');
    expect(
      (await post(`/admin/seller-orders/${so}/status`, buyer, { status: 'COMPLETED' })).status,
    ).toBe(403);
  });

  it('hides other people’s seller orders: 404 for another store, another buyer, a wrong order id', async () => {
    const { buyer, other, first, second, a, b } = await world();
    const { order, soOf, capture } = await placeOrder(buyer, [a.id, b.id]);
    await capture();
    const soA = soOf(first.sellerId!);
    await post(`/seller/orders/${soA}/status`, first, { status: 'PROCESSING' });
    await post(`/seller/orders/${soA}/status`, first, { status: 'SHIPPED' });

    expect(
      (await post(`/seller/orders/${soA}/status`, second, { status: 'PROCESSING' })).status,
    ).toBe(404);
    expect(
      (await post(`/orders/${order.id}/seller-orders/${soA}/confirm-receipt`, other)).status,
    ).toBe(404);
    expect(
      (await post(`/orders/${randomUUID()}/seller-orders/${soA}/confirm-receipt`, buyer)).status,
    ).toBe(404);
    expect(
      (await post(`/seller/orders/${randomUUID()}/status`, first, { status: 'PROCESSING' })).status,
    ).toBe(404);
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: soA } })).status).toBe(
      'SHIPPED',
    );
  });

  it('keeps the aggregate right when two sellers change their seller orders at the same time', async () => {
    const { buyer, first, second, a, b } = await world();
    const { order, soOf, capture } = await placeOrder(buyer, [a.id, b.id]);
    await capture();
    const [soA, soB] = [soOf(first.sellerId!), soOf(second.sellerId!)];
    await post(`/seller/orders/${soA}/status`, first, { status: 'PROCESSING' });
    await post(`/seller/orders/${soB}/status`, second, { status: 'PROCESSING' });

    const results = await Promise.all([
      post(`/seller/orders/${soA}/status`, first, { status: 'SHIPPED' }),
      post(`/seller/orders/${soB}/status`, second, { status: 'SHIPPED' }),
    ]);

    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(await orderStatus(order.id)).toBe('SHIPPED');
    const version = (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).version;
    const aggregateEvents = await prisma.outboxEvent.count({
      where: { eventType: 'order.status_changed', aggregateId: order.id },
    });
    expect(aggregateEvents).toBe(version);
  });
});
