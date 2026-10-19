import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { Product } from '../../src/generated/prisma/client';
import type { UserRole } from '../../src/modules/users';
import { PrismaService } from '../../src/prisma';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface OrderBody {
  id: string;
  sellerOrders: { id: string; seller: { id: string } }[];
}

interface ErrorBody {
  error: { code: string };
}

interface Caller { id: string; roles?: UserRole[]; sellerId?: string }

describe('Seller order cancellation (e2e)', () => {
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

  const post = async (path: string, caller: Caller, body?: object) => {
    const req = request(app.getHttpServer())
      .post(`/api${path}`)
      .set('Authorization', await bearerFor(app, caller));
    return body === undefined ? req : req.send(body);
  };

  const sellerCaller = (s: Awaited<ReturnType<typeof createSeller>>): Caller => ({
    id: s.user.id,
    roles: ['CUSTOMER', 'SELLER'],
    sellerId: s.seller.id,
  });

  /** Three stores with one product each (50.00, 33.35 and 1.00; ten in stock). */
  const world = async () => {
    const buyer = await createUser(prisma);
    const other = await createUser(prisma);
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });
    const stores = await Promise.all([
      createSeller(prisma),
      createSeller(prisma),
      createSeller(prisma),
    ]);
    const [storeA, storeB, storeC] = stores;
    const product = (store: typeof storeA, priceCents: number): Promise<Product> =>
      createProduct(prisma, { sellerId: store.seller.id, priceCents, stock: 10 });
    return {
      buyer,
      other,
      admin: { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] as UserRole[] },
      sellerA: sellerCaller(storeA),
      sellerB: sellerCaller(storeB),
      sellerC: sellerCaller(storeC),
      a: await product(storeA, 5_000),
      b: await product(storeB, 3_335),
      c: await product(storeC, 100),
    };
  };

  /** Buys two units of each product through checkout. */
  const placeOrder = async (buyer: Caller, productIds: string[]) => {
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: productIds.map((productId) => ({ cartId: cart.id, productId, quantity: 2 })),
    });
    const response = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, buyer))
      .set('Idempotency-Key', randomUUID());
    const order = response.body as OrderBody;
    const bySeller = new Map(order.sellerOrders.map((so) => [so.seller.id, so.id]));
    return {
      order,
      soOf: (caller: Caller): string => bySeller.get(caller.sellerId ?? '') ?? '',
      capture: () =>
        prisma.sellerOrder.updateMany({
          where: { orderId: order.id },
          data: { paymentStatus: 'CAPTURED' },
        }),
    };
  };

  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  const ledgerSum = async (sellerOrderId: string) =>
    (await prisma.ledgerEntry.aggregate({ where: { sellerOrderId }, _sum: { amountCents: true } }))
      ._sum.amountCents;

  it('cancels only the seller order of the cancelling store and leaves the others untouched', async () => {
    const { buyer, sellerA, sellerB, sellerC, a, b, c } = await world();
    const { order, soOf } = await placeOrder(buyer, [a.id, b.id, c.id]);
    const others = [soOf(sellerB), soOf(sellerC)];
    const before = await prisma.sellerOrder.findMany({
      where: { id: { in: others } },
      orderBy: { id: 'asc' },
    });
    const ledgerBefore = await prisma.ledgerEntry.findMany({
      where: { sellerOrderId: { in: others } },
      orderBy: { id: 'asc' },
    });
    const orderBefore = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderBefore.commissionCents).toBe(1_000 + 667 + 20);

    const response = await post(`/seller/orders/${soOf(sellerA)}/cancel`, sellerA, {
      reason: 'Out of the colour',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'CANCELLED',
      commissionCents: 0,
      payoutCents: 0,
      subtotalCents: 10_000,
    });
    const cancelled = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: soOf(sellerA) } });
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'SELLER',
      cancelReason: 'Out of the colour',
      commissionCents: 0,
      payoutCents: 0,
    });

    // The other seller orders did not move at all.
    expect(
      await prisma.sellerOrder.findMany({ where: { id: { in: others } }, orderBy: { id: 'asc' } }),
    ).toEqual(before);
    expect(
      await prisma.ledgerEntry.findMany({
        where: { sellerOrderId: { in: others } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(ledgerBefore);

    // Stock is back for the cancelled items only.
    expect(await stockOf(a.id)).toBe(10);
    expect(await stockOf(b.id)).toBe(8);
    expect(await stockOf(c.id)).toBe(8);

    // The books of the cancelled seller order net to zero.
    const entries = await prisma.ledgerEntry.findMany({ where: { sellerOrderId: cancelled.id } });
    expect(entries.map((entry) => [entry.type, entry.amountCents]).sort()).toEqual(
      [
        ['SALE', 10_000],
        ['COMMISSION', -1_000],
        ['CANCELLATION', -10_000],
        ['COMMISSION_REVERSAL', 1_000],
      ].sort(),
    );
    expect(await ledgerSum(cancelled.id)).toBe(0);

    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'NEW',
      hasCancelledParts: true,
      subtotalCents: orderBefore.subtotalCents,
      refundedCents: 10_000,
      totalCents: orderBefore.subtotalCents - 10_000,
      commissionCents: 667 + 20,
    });

    const events = (await prisma.outboxEvent.findMany()).map((event) => event.eventType);
    expect(events).toEqual(
      expect.arrayContaining([
        'seller_order.cancelled',
        'seller_order.status_changed',
        'order.status_changed',
      ]),
    );
    expect(events.filter((type) => type === 'product.stock_changed')).toHaveLength(3 + 1);
    const metrics = (await request(app.getHttpServer()).get('/metrics')).text;
    expect(metrics).toMatch(/^seller_orders_cancelled_total\{actor="SELLER"\} 1$/m);
  });

  it('makes the order CANCELLED once every seller order is cancelled', async () => {
    const { buyer, sellerA, sellerB, a, b } = await world();
    const { order, soOf } = await placeOrder(buyer, [a.id, b.id]);

    await post(`/seller/orders/${soOf(sellerA)}/cancel`, sellerA, { reason: 'No stock' });
    await post(`/seller/orders/${soOf(sellerB)}/cancel`, sellerB, { reason: 'No stock' });

    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'CANCELLED',
      hasCancelledParts: false,
      totalCents: 0,
      commissionCents: 0,
      refundedCents: 10_000 + 6_670,
    });
  });

  it('lets the customer cancel only while the seller order is NEW', async () => {
    const { buyer, sellerA, sellerB, a, b } = await world();
    const { order, soOf, capture } = await placeOrder(buyer, [a.id, b.id]);
    await capture();
    await post(`/seller/orders/${soOf(sellerB)}/status`, sellerB, { status: 'PROCESSING' });

    const late = await post(`/orders/${order.id}/seller-orders/${soOf(sellerB)}/cancel`, buyer);
    expect(late.status).toBe(409);
    expect((late.body as ErrorBody).error.code).toBe('INVALID_STATUS_TRANSITION');

    const early = await post(`/orders/${order.id}/seller-orders/${soOf(sellerA)}/cancel`, buyer);
    expect(early.status).toBe(200);
    expect(early.body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    expect(
      (await prisma.sellerOrderStatusHistory.findFirstOrThrow({ where: { toStatus: 'CANCELLED' } }))
        .actorType,
    ).toBe('CUSTOMER');
  });

  it('lets a seller cancel while PROCESSING but not once SHIPPED, and not twice', async () => {
    const { buyer, sellerA, sellerB, a, b } = await world();
    const { soOf, capture } = await placeOrder(buyer, [a.id, b.id]);
    await capture();
    const [soA, soB] = [soOf(sellerA), soOf(sellerB)];
    await post(`/seller/orders/${soA}/status`, sellerA, { status: 'PROCESSING' });
    await post(`/seller/orders/${soB}/status`, sellerB, { status: 'PROCESSING' });
    await post(`/seller/orders/${soB}/status`, sellerB, { status: 'SHIPPED' });

    const shipped = await post(`/seller/orders/${soB}/cancel`, sellerB, {
      reason: 'Changed my mind',
    });
    expect(shipped.status).toBe(409);
    expect((shipped.body as ErrorBody).error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(
      (await post(`/seller/orders/${soA}/cancel`, sellerA, { reason: 'Damaged' })).status,
    ).toBe(200);
    expect((await post(`/seller/orders/${soA}/cancel`, sellerA, { reason: 'Again' })).status).toBe(
      409,
    );
    expect(await stockOf(a.id)).toBe(10);
    expect(await stockOf(b.id)).toBe(8);
    expect(
      await prisma.ledgerEntry.count({ where: { sellerOrderId: soA, type: 'CANCELLATION' } }),
    ).toBe(1);
  });

  it('hides other people’s seller orders and validates the reason', async () => {
    const { buyer, other, sellerA, sellerB, a, b } = await world();
    const { order, soOf } = await placeOrder(buyer, [a.id, b.id]);
    const soA = soOf(sellerA);

    expect(
      (await post(`/seller/orders/${soA}/cancel`, sellerB, { reason: 'Not mine' })).status,
    ).toBe(404);
    expect((await post(`/orders/${order.id}/seller-orders/${soA}/cancel`, other)).status).toBe(404);
    expect(
      (await post(`/seller/orders/${randomUUID()}/cancel`, sellerA, { reason: 'x' })).status,
    ).toBe(404);
    expect((await post(`/seller/orders/${soA}/cancel`, sellerA, {})).status).toBe(400);
    expect((await post(`/seller/orders/${soA}/cancel`, sellerA, { reason: '   ' })).status).toBe(
      400,
    );
    expect((await post(`/seller/orders/${soA}/cancel`, buyer, { reason: 'x' })).status).toBe(403);
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: soA } })).status).toBe('NEW');
  });

  it('lets an admin cancel any seller order that is not final', async () => {
    const { buyer, admin, sellerA, a } = await world();
    const { soOf } = await placeOrder(buyer, [a.id]);
    const soA = soOf(sellerA);

    const response = await post(`/admin/seller-orders/${soA}/cancel`, admin, {
      reason: 'Fraud check',
    });

    expect(response.status).toBe(200);
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: soA } })).cancelledBy).toBe(
      'ADMIN',
    );
    expect((await post(`/admin/seller-orders/${soA}/cancel`, buyer, { reason: 'x' })).status).toBe(
      403,
    );
  });
});
