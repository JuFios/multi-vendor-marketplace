import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { UserRole } from '../../src/modules/users/user-role';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface Caller {
  id: string;
  roles?: UserRole[];
  sellerId?: string;
}

interface RefundBody {
  amountCents: number;
  refunds: { id: string; sellerOrderItemId: string; quantity: number; amountCents: number }[];
  sellerOrder: { refundedCents: number; commissionCents: number; payoutCents: number };
}

interface ErrorBody {
  error: { code: string };
}

describe('Refunds (e2e)', () => {
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

  const sellerCaller = (s: Awaited<ReturnType<typeof createSeller>>): Caller => ({
    id: s.user.id,
    roles: ['CUSTOMER', 'SELLER'],
    sellerId: s.seller.id,
  });

  const refund = async (
    sellerOrderId: string,
    caller: Caller,
    body: object,
    key: string = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post(`/api/seller/orders/${sellerOrderId}/refunds`)
      .set('Authorization', await bearerFor(app, caller))
      .set('Idempotency-Key', key)
      .send(body);

  /** One store sells 3 × 20.00 and 1 × 40.00; the order is accepted and paid. */
  const world = async (state: 'NEW' | 'PROCESSING' | 'SHIPPED' = 'SHIPPED') => {
    const buyer = await createUser(prisma);
    const store = await createSeller(prisma);
    const other = await createSeller(prisma);
    const first = await createProduct(prisma, {
      sellerId: store.seller.id,
      priceCents: 2_000,
      stock: 10,
    });
    const second = await createProduct(prisma, {
      sellerId: store.seller.id,
      priceCents: 4_000,
      stock: 10,
    });
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: [
        { cartId: cart.id, productId: first.id, quantity: 3 },
        { cartId: cart.id, productId: second.id, quantity: 1 },
      ],
    });
    const checkout = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, buyer))
      .set('Idempotency-Key', randomUUID());
    const orderId = (checkout.body as { id: string }).id;
    const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId } });
    if (state !== 'NEW') {
      await prisma.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: { status: state, paymentStatus: 'CAPTURED' },
      });
    }
    const items = await prisma.sellerOrderItem.findMany({
      where: { sellerOrderId: sellerOrder.id },
    });
    const itemOf = (productId: string) => items.find((item) => item.productId === productId)!.id;
    return {
      orderId,
      sellerOrderId: sellerOrder.id,
      seller: sellerCaller(store),
      otherSeller: sellerCaller(other),
      buyer: { id: buyer.id },
      first: itemOf(first.id),
      second: itemOf(second.id),
      firstProductId: first.id,
    };
  };

  const ledgerOf = async (sellerOrderId: string) =>
    prisma.ledgerEntry.findMany({ where: { sellerOrderId }, orderBy: { createdAt: 'asc' } });

  it('refunds part of an item and recomputes the commission, the books and the order totals', async () => {
    const { seller, sellerOrderId, orderId, first, firstProductId } = await world();

    const response = await refund(sellerOrderId, seller, {
      items: [{ sellerOrderItemId: first, quantity: 2 }],
      reason: 'Damaged in transit',
    });

    expect(response.status).toBe(201);
    const body = response.body as RefundBody;
    expect(body.amountCents).toBe(4_000);
    expect(body.refunds).toHaveLength(1);
    expect(body.sellerOrder).toMatchObject({
      refundedCents: 4_000,
      commissionCents: 600,
      payoutCents: 5_400,
    });

    const item = await prisma.sellerOrderItem.findUniqueOrThrow({ where: { id: first } });
    expect(item).toMatchObject({ refundedQuantity: 2, refundedCents: 4_000 });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order).toMatchObject({ refundedCents: 4_000, totalCents: 6_000, commissionCents: 600 });

    const entries = await ledgerOf(sellerOrderId);
    expect(entries.map((entry) => [entry.type, entry.amountCents])).toEqual([
      ['SALE', 10_000],
      ['COMMISSION', -1_000],
      ['REFUND', -4_000],
      ['COMMISSION_REVERSAL', 400],
    ]);
    expect(entries[2]?.refId).toBe(body.refunds[0]?.id);
    expect(entries.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(5_400);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: firstProductId } })).stock).toBe(
      7,
    );
    const events = await prisma.outboxEvent.findMany({ where: { eventType: 'refund.created' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ sellerOrderId, amountCents: 4_000 });
    // The money goes back through the gateway, asked for in the same transaction.
    const requests = await prisma.outboxEvent.findMany({
      where: { eventType: 'payment.refund_requested' },
    });
    expect(requests.map((event) => event.payload)).toEqual([
      { sellerOrderId, amountCents: 4_000, reason: 'REFUND' },
    ]);
  });

  it('refunds several items in one request and may take everything back', async () => {
    const { seller, sellerOrderId, first, second } = await world();

    const response = await refund(sellerOrderId, seller, {
      items: [
        { sellerOrderItemId: first, quantity: 3 },
        { sellerOrderItemId: second, quantity: 1 },
      ],
      reason: 'Order withdrawn',
    });

    expect(response.status).toBe(201);
    expect((response.body as RefundBody).sellerOrder).toMatchObject({
      refundedCents: 10_000,
      commissionCents: 0,
      payoutCents: 0,
    });
    const entries = await ledgerOf(sellerOrderId);
    expect(entries.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(0);
  });

  it('puts refunded units of a processing order back in stock and restocks only the rest on cancel', async () => {
    const { seller, sellerOrderId, first, second, firstProductId } = await world('PROCESSING');
    const stockOf = async (id: string) =>
      (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
    const secondProductId = (
      await prisma.sellerOrderItem.findUniqueOrThrow({ where: { id: second } })
    ).productId;
    expect(await stockOf(firstProductId)).toBe(7);

    const response = await refund(sellerOrderId, seller, {
      items: [{ sellerOrderItemId: first, quantity: 2 }],
      reason: 'Out of stock at the warehouse',
    });

    expect(response.status).toBe(201);
    expect(await stockOf(firstProductId)).toBe(9);
    const stockEvents = await prisma.outboxEvent.findMany({
      where: { eventType: 'product.stock_changed', aggregateId: firstProductId },
    });
    expect(stockEvents.at(-1)?.payload).toMatchObject({ productId: firstProductId, stock: 9 });

    const cancelled = await request(app.getHttpServer())
      .post(`/api/seller/orders/${sellerOrderId}/cancel`)
      .set('Authorization', await bearerFor(app, seller))
      .send({ reason: 'Withdrawn' });

    expect(cancelled.status).toBe(200);
    expect(await stockOf(firstProductId)).toBe(10);
    expect(await stockOf(secondProductId)).toBe(10);
  });

  it('rejects a refund of more than is left with 422 and changes nothing', async () => {
    const { seller, sellerOrderId, first } = await world();
    await refund(sellerOrderId, seller, {
      items: [{ sellerOrderItemId: first, quantity: 2 }],
      reason: 'x',
    });

    const response = await refund(sellerOrderId, seller, {
      items: [{ sellerOrderItemId: first, quantity: 2 }],
      reason: 'again',
    });

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).error.code).toBe('REFUND_EXCEEDS_REMAINING');
    expect(await prisma.refund.count()).toBe(1);
    expect(await ledgerOf(sellerOrderId)).toHaveLength(4);
  });

  it('rejects an item of another seller order with 422', async () => {
    const { seller, sellerOrderId } = await world();

    const response = await refund(sellerOrderId, seller, {
      items: [{ sellerOrderItemId: randomUUID(), quantity: 1 }],
      reason: 'x',
    });

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).error.code).toBe('REFUND_ITEM_NOT_FOUND');
  });

  it('refunds once when the same key is repeated', async () => {
    const { seller, sellerOrderId, first } = await world();
    const key = randomUUID();
    const body = { items: [{ sellerOrderItemId: first, quantity: 1 }], reason: 'Wrong size' };

    const original = await refund(sellerOrderId, seller, body, key);
    const replay = await refund(sellerOrderId, seller, body, key);

    expect(original.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body).toEqual(original.body);
    expect(await prisma.refund.count()).toBe(1);
    expect(await ledgerOf(sellerOrderId)).toHaveLength(4);
  });

  it('lets only one of two parallel refunds of the last unit succeed', async () => {
    const { seller, sellerOrderId, second } = await world();
    const body = { items: [{ sellerOrderItemId: second, quantity: 1 }], reason: 'Broken' };

    const responses = await Promise.all([
      refund(sellerOrderId, seller, body),
      refund(sellerOrderId, seller, body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    expect(await prisma.refund.count()).toBe(1);
    const so = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrderId } });
    expect(so.refundedCents).toBe(4_000);
  });

  it('answers 404 for another store’s seller order', async () => {
    const { otherSeller, sellerOrderId, first } = await world();

    const response = await refund(sellerOrderId, otherSeller, {
      items: [{ sellerOrderItemId: first, quantity: 1 }],
      reason: 'x',
    });

    expect(response.status).toBe(404);
    expect(await prisma.refund.count()).toBe(0);
  });

  it('answers 403 to a customer who is not a seller', async () => {
    const { buyer, sellerOrderId, first } = await world();

    const response = await refund(sellerOrderId, buyer, {
      items: [{ sellerOrderItemId: first, quantity: 1 }],
      reason: 'x',
    });

    expect(response.status).toBe(403);
  });

  it('answers 409 while the seller order is still NEW', async () => {
    const { seller, sellerOrderId, first } = await world('NEW');

    const response = await refund(sellerOrderId, seller, {
      items: [{ sellerOrderItemId: first, quantity: 1 }],
      reason: 'x',
    });

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('REFUND_NOT_ALLOWED');
  });

  it('answers 409 when the payment was not captured', async () => {
    const { seller, sellerOrderId, first } = await world();
    await prisma.sellerOrder.update({
      where: { id: sellerOrderId },
      data: { paymentStatus: 'PENDING' },
    });

    const response = await refund(sellerOrderId, seller, {
      items: [{ sellerOrderItemId: first, quantity: 1 }],
      reason: 'x',
    });

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('PAYMENT_NOT_CAPTURED');
  });

  it('validates the body', async () => {
    const { seller, sellerOrderId, first } = await world();

    const empty = await refund(sellerOrderId, seller, { items: [], reason: 'x' });
    const zero = await refund(sellerOrderId, seller, {
      items: [{ sellerOrderItemId: first, quantity: 0 }],
      reason: 'x',
    });
    const duplicate = await refund(sellerOrderId, seller, {
      items: [
        { sellerOrderItemId: first, quantity: 1 },
        { sellerOrderItemId: first, quantity: 1 },
      ],
      reason: 'x',
    });

    expect([empty.status, zero.status, duplicate.status]).toEqual([400, 400, 400]);
  });
});
