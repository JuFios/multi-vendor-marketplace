import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { AnyDomainEvent } from '../../src/outbox/events/domain-event';
import { newEventId } from '../../src/outbox/events/event-id';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QUEUE } from '../../src/queue/queue-names';
import { QUEUE_PUBLISHER, type QueuePublisherPort } from '../../src/queue/queue-publisher.port';
import { bearerFor } from '../utils/auth';
import { createSeller, createSellerOrder } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';

describe('Sales read models (e2e)', () => {
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

  const createdEvent = (
    sellerOrderId: string,
    orderId: string,
    sellerId: string,
  ): AnyDomainEvent => ({
    id: newEventId(),
    type: EVENT_TYPE.SELLER_ORDER_CREATED,
    aggregateType: 'seller_order',
    aggregateId: sellerOrderId,
    occurredAt: new Date().toISOString(),
    correlationId: null,
    actorId: null,
    schemaVersion: 1,
    payload: { sellerOrderId, orderId, sellerId, customerId: randomUUID(), amountCents: 0 },
  });

  /** Hands the event to the analytics consumer only, as the relay would. */
  const deliver = (event: AnyDomainEvent) =>
    app.get<QueuePublisherPort>(QUEUE_PUBLISHER).publish(QUEUE.ANALYTICS, event);

  const sellerRows = () =>
    prisma.salesDailyBySeller.findMany({ orderBy: [{ day: 'asc' }, { sellerId: 'asc' }] });
  const dayOf = (row: { day: Date }): string => row.day.toISOString().slice(0, 10);

  /**
   * Store A sells two orders and store B one. The first order is placed at 00:30 on 2 March in
   * the analytics zone, which is still 1 March in UTC.
   */
  const world = async () => {
    const storeA = await createSeller(prisma);
    const storeB = await createSeller(prisma);
    const first = await createSellerOrder(prisma, {
      sellerId: storeA.seller.id,
      quantity: 2,
      unitPriceCents: 5_000,
      createdAt: new Date('2026-03-01T22:30:00Z'),
    });
    const second = await createSellerOrder(prisma, {
      sellerId: storeA.seller.id,
      quantity: 1,
      unitPriceCents: 3_000,
      createdAt: new Date('2026-03-02T10:00:00Z'),
    });
    const third = await createSellerOrder(prisma, {
      sellerId: storeB.seller.id,
      quantity: 3,
      unitPriceCents: 2_000,
      createdAt: new Date('2026-03-05T12:00:00Z'),
    });
    const events = [first, second, third].map((made) =>
      createdEvent(made.sellerOrder.id, made.order.id, made.sellerOrder.sellerId),
    );
    return { storeA, storeB, first, second, third, events };
  };

  it('books each order on its day in the analytics time zone', async () => {
    const { storeA, storeB, events } = await world();

    for (const event of events) {
      await deliver(event);
    }
    await flushEvents();

    const rows = await sellerRows();
    expect(
      rows.map((row) => ({
        day: dayOf(row),
        sellerId: row.sellerId,
        ordersCount: row.ordersCount,
        itemsCount: row.itemsCount,
        grossCents: row.grossCents,
        refundedCents: row.refundedCents,
        commissionCents: row.commissionCents,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          day: '2026-03-02',
          sellerId: storeA.seller.id,
          ordersCount: 2,
          itemsCount: 3,
          grossCents: 13_000,
          refundedCents: 0,
          commissionCents: 1_300,
        },
        {
          day: '2026-03-05',
          sellerId: storeB.seller.id,
          ordersCount: 1,
          itemsCount: 3,
          grossCents: 6_000,
          refundedCents: 0,
          commissionCents: 600,
        },
      ]),
    );
    expect(rows).toHaveLength(2);
    const products = await prisma.salesDailyByProduct.findMany();
    expect(products).toHaveLength(3);
    expect(products.reduce((sum, row) => sum + row.grossCents, 0)).toBe(19_000);
  });

  it('counts an event once, however often it is delivered', async () => {
    const { events } = await world();
    const [event] = events;

    await deliver(event!);
    await flushEvents();
    await deliver(event!);
    await flushEvents();

    const rows = await sellerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ordersCount: 1, itemsCount: 2, grossCents: 10_000 });
    expect(await prisma.processedEvent.count({ where: { consumer: 'analytics' } })).toBe(1);
  });

  it('books a refund on the day of its order and gives back commission', async () => {
    const { storeA, second, events } = await world();
    for (const event of events) {
      await deliver(event);
    }
    await flushEvents();
    await prisma.sellerOrder.update({
      where: { id: second.sellerOrder.id },
      data: { status: 'SHIPPED', paymentStatus: 'CAPTURED' },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/seller/orders/${second.sellerOrder.id}/refunds`)
      .set(
        'Authorization',
        await bearerFor(app, {
          id: storeA.user.id,
          roles: ['CUSTOMER', 'SELLER'],
          sellerId: storeA.seller.id,
        }),
      )
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ sellerOrderItemId: second.item.id, quantity: 1 }], reason: 'Damaged' });
    expect(response.status).toBe(201);
    await flushEvents();

    const row = await prisma.salesDailyBySeller.findFirstOrThrow({
      where: { sellerId: storeA.seller.id },
    });
    expect(dayOf(row)).toBe('2026-03-02');
    expect(row).toMatchObject({
      ordersCount: 2,
      grossCents: 13_000,
      refundedCents: 3_000,
      commissionCents: 1_000,
    });
    const product = await prisma.salesDailyByProduct.findFirstOrThrow({
      where: { productId: second.product.id },
    });
    expect(product).toMatchObject({ quantity: 1, grossCents: 3_000, refundedCents: 3_000 });
  });

  it('takes a cancelled order, with its refunds, out of the totals', async () => {
    const { storeB, third, events } = await world();
    for (const event of events) {
      await deliver(event);
    }
    await flushEvents();

    const response = await request(app.getHttpServer())
      .post(`/api/seller/orders/${third.sellerOrder.id}/cancel`)
      .set(
        'Authorization',
        await bearerFor(app, {
          id: storeB.user.id,
          roles: ['CUSTOMER', 'SELLER'],
          sellerId: storeB.seller.id,
        }),
      )
      .send({ reason: 'Out of stock' });
    expect(response.status).toBe(200);
    await flushEvents();

    const row = await prisma.salesDailyBySeller.findFirstOrThrow({
      where: { sellerId: storeB.seller.id },
    });
    expect(row).toMatchObject({
      ordersCount: 0,
      itemsCount: 0,
      grossCents: 0,
      refundedCents: 0,
      commissionCents: 0,
    });
    const product = await prisma.salesDailyByProduct.findFirstOrThrow({
      where: { productId: third.product.id },
    });
    expect(product).toMatchObject({ quantity: 0, grossCents: 0, refundedCents: 0 });
  });
});
