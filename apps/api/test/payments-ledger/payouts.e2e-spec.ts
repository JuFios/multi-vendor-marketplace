import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

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

describe('Payouts (e2e)', () => {
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

  const post = async (path: string, caller: Caller, body?: object) => {
    const req = request(app.getHttpServer())
      .post(`/api${path}`)
      .set('Authorization', await bearerFor(app, caller))
      .set('Idempotency-Key', randomUUID());
    return body === undefined ? req : req.send(body);
  };

  const callerOf = (s: Awaited<ReturnType<typeof createSeller>>): Caller => ({
    id: s.user.id,
    roles: ['CUSTOMER', 'SELLER'],
    sellerId: s.seller.id,
  });

  /** Two stores; the buyer takes 3 × 20.00 from A and 1 × 50.00 from B. */
  const world = async () => {
    const buyer = await createUser(prisma);
    const storeA = await createSeller(prisma);
    const storeB = await createSeller(prisma);
    const a = await createProduct(prisma, { sellerId: storeA.seller.id, priceCents: 2_000 });
    const b = await createProduct(prisma, { sellerId: storeB.seller.id, priceCents: 5_000 });
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: [
        { cartId: cart.id, productId: a.id, quantity: 3 },
        { cartId: cart.id, productId: b.id, quantity: 1 },
      ],
    });
    const response = await post('/orders/checkout', buyer);
    const order = response.body as OrderBody;
    await flushEvents();
    const soOf = (sellerId: string) =>
      order.sellerOrders.find((so) => so.seller.id === sellerId)?.id ?? '';
    return {
      buyer,
      orderId: order.id,
      sellerA: callerOf(storeA),
      sellerB: callerOf(storeB),
      soA: soOf(storeA.seller.id),
      soB: soOf(storeB.seller.id),
    };
  };

  const complete = async (
    w: Awaited<ReturnType<typeof world>>,
    soId: string,
    seller: Caller,
  ): Promise<void> => {
    await post(`/seller/orders/${soId}/status`, seller, { status: 'PROCESSING' });
    await post(`/seller/orders/${soId}/status`, seller, { status: 'SHIPPED' });
    const done = await post(`/orders/${w.orderId}/seller-orders/${soId}/confirm-receipt`, w.buyer);
    expect(done.status).toBe(200);
    await flushEvents();
  };

  const ledgerSum = async (sellerOrderId: string) =>
    (await prisma.ledgerEntry.aggregate({ where: { sellerOrderId }, _sum: { amountCents: true } }))
      ._sum.amountCents;

  it('pays the seller what the order owes once it is completed, and nets its books to zero', async () => {
    const w = await world();
    expect(await prisma.payout.count()).toBe(0);

    await complete(w, w.soA, w.sellerA);

    const payout = await prisma.payout.findUniqueOrThrow({ where: { sellerOrderId: w.soA } });
    expect(payout).toMatchObject({
      amountCents: 5_400,
      status: 'PAID',
      sellerId: w.sellerA.sellerId,
    });
    expect(payout.paidAt).not.toBeNull();
    const entry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { sellerOrderId: w.soA, type: 'PAYOUT' },
    });
    expect(entry).toMatchObject({ amountCents: -5_400, refId: payout.id });
    expect(await ledgerSum(w.soA)).toBe(0);

    expect(await prisma.payout.count({ where: { sellerOrderId: w.soB } })).toBe(0);
    expect(await ledgerSum(w.soB)).toBe(4_500);
  });

  it('pays only what is left after a refund', async () => {
    const w = await world();
    await post(`/seller/orders/${w.soA}/status`, w.sellerA, { status: 'PROCESSING' });
    await flushEvents();
    const item = await prisma.sellerOrderItem.findFirstOrThrow({
      where: { sellerOrderId: w.soA },
    });
    const refunded = await post(`/seller/orders/${w.soA}/refunds`, w.sellerA, {
      items: [{ sellerOrderItemId: item.id, quantity: 1 }],
      reason: 'Scratched',
    });
    expect(refunded.status).toBe(201);

    await complete(w, w.soA, w.sellerA);

    const so = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: w.soA } });
    const payout = await prisma.payout.findUniqueOrThrow({ where: { sellerOrderId: w.soA } });
    expect(payout.amountCents).toBe(so.payoutCents);
    expect(payout.amountCents).toBe(3_600);
    expect(await ledgerSum(w.soA)).toBe(0);
  });

  it('pays once when the completion event is delivered twice', async () => {
    const w = await world();
    await complete(w, w.soA, w.sellerA);
    const completed = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'seller_order.status_changed',
        aggregateId: w.soA,
        payload: { path: ['to'], equals: 'COMPLETED' },
      },
    });

    await queueOf(app, QUEUE.PAYOUTS).remove(completed.id);
    await app.get<QueuePublisherPort>(QUEUE_PUBLISHER).publish(QUEUE.PAYOUTS, toEvent(completed));
    await flushEvents();

    expect(await prisma.payout.count({ where: { sellerOrderId: w.soA } })).toBe(1);
    expect(
      await prisma.ledgerEntry.count({ where: { sellerOrderId: w.soA, type: 'PAYOUT' } }),
    ).toBe(1);
    expect(await ledgerSum(w.soA)).toBe(0);
  });

  it('lets a refund after the payout pull the balance below zero', async () => {
    const w = await world();
    await complete(w, w.soA, w.sellerA);
    const item = await prisma.sellerOrderItem.findFirstOrThrow({
      where: { sellerOrderId: w.soA },
    });

    const refunded = await post(`/seller/orders/${w.soA}/refunds`, w.sellerA, {
      items: [{ sellerOrderItemId: item.id, quantity: 1 }],
      reason: 'Returned',
    });

    expect(refunded.status).toBe(201);
    await flushEvents();
    expect(await prisma.payout.count({ where: { sellerOrderId: w.soA } })).toBe(1);
    expect(await ledgerSum(w.soA)).toBe(-1_800);
    const finance = await request(app.getHttpServer())
      .get('/api/seller/finance')
      .set('Authorization', await bearerFor(app, w.sellerA));
    expect(finance.body).toMatchObject({ paidOutCents: 5_400, balanceCents: -1_800 });
  });

  it('pays nothing for a cancelled seller order', async () => {
    const w = await world();

    await post(`/seller/orders/${w.soA}/cancel`, w.sellerA, { reason: 'Out of stock' });
    await flushEvents();

    expect(await prisma.payout.count()).toBe(0);
    expect(await ledgerSum(w.soA)).toBe(0);
  });
});
