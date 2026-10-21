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
import { createAuction, createProduct, createSeller, createUser } from '../utils/factories';
import { flushEvents, queueOf } from '../utils/flush-events';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';
import { waitUntil } from '../utils/wait-until';

interface Caller {
  id: string;
  roles?: UserRole[];
  sellerId?: string;
}

interface CartBody {
  groups: {
    items: {
      productId: string;
      unitPriceCents: number;
      quantity: number;
      availability: string;
    }[];
  }[];
  totalCents: number;
}

interface OrderBody {
  id: string;
  totalCents: number;
  sellerOrders: {
    id: string;
    subtotalCents: number;
    commissionCents: number;
    items: { productId: string; unitPriceCents: number; quantity: number }[];
  }[];
}

interface ErrorBody {
  error: { code: string; details?: { items?: { productId: string; reason: string }[] } };
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

describe('Auction lots in the cart and at checkout (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetState(prisma);
    await queueOf(app, QUEUE.AUCTIONS).obliterate({ force: true });
  });

  afterAll(async () => {
    await flushEvents();
    await resetState(prisma);
    await app.close();
  });

  const call = async (
    method: 'get' | 'post' | 'delete',
    path: string,
    caller: Caller,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/api${path}`)
      .set('Authorization', await bearerFor(app, caller));
    return body === undefined ? req : req.send(body);
  };

  const bid = async (auctionId: string, caller: Caller, amountCents: number) =>
    request(app.getHttpServer())
      .post(`/api/auctions/${auctionId}/bids`)
      .set('Authorization', await bearerFor(app, caller))
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents });

  const checkout = async (caller: Caller) =>
    request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, caller))
      .set('Idempotency-Key', randomUUID());

  const sellerOf = (s: Awaited<ReturnType<typeof createSeller>>): Caller => ({
    id: s.user.id,
    roles: ['CUSTOMER', 'SELLER'],
    sellerId: s.seller.id,
  });

  /** A lot (100.00, step 5.00) of a new store that closes a second from now and is won by `winner`. */
  const wonLot = async () => {
    const store = await createSeller(prisma);
    const winner = await createUser(prisma);
    const other = await createUser(prisma);
    const product = await createProduct(prisma, {
      sellerId: store.seller.id,
      type: 'AUCTION',
      priceCents: null,
      stock: 1,
    });
    const auction = await createAuction(prisma, {
      productId: product.id,
      endsAt: new Date(Date.now() + 1_000),
    });
    await bid(auction.id, other, 10_000);
    await bid(auction.id, winner, 12_500);
    await waitUntil(
      async () =>
        (await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status ===
        'SOLD_TO_WINNER',
      { timeoutMs: 8_000, label: 'the auction to be sold' },
    );
    await flushEvents();
    return {
      auction,
      seller: sellerOf(store),
      winner: { id: winner.id } as Caller,
      other: { id: other.id } as Caller,
    };
  };

  const cartOf = async (caller: Caller) => (await call('get', '/cart', caller)).body as CartBody;

  it('puts the won lot into the winner’s cart at the winning price, and only theirs', async () => {
    const { auction, winner, other } = await wonLot();

    const cart = await cartOf(winner);

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0]?.items).toEqual([
      expect.objectContaining({
        productId: auction.productId,
        unitPriceCents: 12_500,
        quantity: 1,
        availability: 'AVAILABLE',
      }),
    ]);
    expect(cart.totalCents).toBe(12_500);
    expect((await cartOf(other)).groups).toEqual([]);
  });

  it('adds the lot once even when the closing event is delivered twice', async () => {
    const { auction, winner } = await wonLot();
    const closed = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'auction.closed', aggregateId: auction.id },
    });

    await queueOf(app, QUEUE.CART).remove(closed.id);
    await app.get<QueuePublisherPort>(QUEUE_PUBLISHER).publish(QUEUE.CART, toEvent(closed));
    await flushEvents();

    expect((await cartOf(winner)).groups[0]?.items).toHaveLength(1);
    expect(await prisma.cartItem.count({ where: { productId: auction.productId } })).toBe(1);
  });

  it('consumes a closing event that arrives after the lot was ordered instead of retrying it', async () => {
    const { auction, winner } = await wonLot();
    expect((await checkout(winner)).status).toBe(201);
    await flushEvents();
    const closed = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'auction.closed', aggregateId: auction.id },
    });
    // As if the cart consumer saw the event only now, e.g. after a long Redis outage.
    await prisma.processedEvent.deleteMany({ where: { consumer: 'cart', eventId: closed.id } });

    await queueOf(app, QUEUE.CART).remove(closed.id);
    await app.get<QueuePublisherPort>(QUEUE_PUBLISHER).publish(QUEUE.CART, toEvent(closed));
    await flushEvents();

    expect(
      await prisma.processedEvent.count({ where: { consumer: 'cart', eventId: closed.id } }),
    ).toBe(1);
    expect(await queueOf(app, QUEUE.CART).getFailedCount()).toBe(0);
    expect((await cartOf(winner)).groups).toEqual([]);
  });

  it('lets only the winner add the lot, and only once the auction is sold', async () => {
    const { auction, winner, other } = await wonLot();
    const running = await createAuction(prisma);

    const notWinner = await call('post', '/cart/items', other, {
      productId: auction.productId,
      quantity: 1,
    });
    const notSoldYet = await call('post', '/cart/items', winner, {
      productId: running.productId,
      quantity: 1,
    });
    await call('delete', `/cart/items/${auction.productId}`, winner);
    const again = await call('post', '/cart/items', winner, {
      productId: auction.productId,
      quantity: 1,
    });

    expect(notWinner.status).toBe(403);
    expect((notWinner.body as ErrorBody).error.code).toBe('AUCTION_NOT_WON');
    expect(notSoldYet.status).toBe(403);
    expect(again.status).toBe(201);
    expect((again.body as CartBody).groups[0]?.items[0]).toMatchObject({
      unitPriceCents: 12_500,
      quantity: 1,
    });
  });

  it('checks out the lot at the winning bid, with the usual commission and without touching stock', async () => {
    const { auction, winner, seller } = await wonLot();

    const response = await checkout(winner);

    expect(response.status).toBe(201);
    const order = response.body as OrderBody;
    expect(order.totalCents).toBe(12_500);
    expect(order.sellerOrders).toHaveLength(1);
    expect(order.sellerOrders[0]).toMatchObject({
      subtotalCents: 12_500,
      commissionCents: 1_250,
      items: [{ productId: auction.productId, unitPriceCents: 12_500, quantity: 1 }],
    });
    const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(stored.status).toBe('ORDERED');
    const item = await prisma.sellerOrderItem.findFirstOrThrow({
      where: { productId: auction.productId },
    });
    expect(item.auctionId).toBe(auction.id);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: auction.productId } })).stock,
    ).toBe(1);
    const ordered = await prisma.outboxEvent.findMany({ where: { eventType: 'auction.ordered' } });
    expect(ordered).toHaveLength(1);
    expect(ordered[0]?.payload).toMatchObject({ auctionId: auction.id, orderId: order.id });
    expect(
      await prisma.ledgerEntry.count({
        where: { sellerOrderId: order.sellerOrders[0]?.id ?? '', sellerId: seller.sellerId ?? '' },
      }),
    ).toBe(2);
    await flushEvents();
  });

  it('checks out a lot together with fixed-price goods of another store', async () => {
    const { auction, winner } = await wonLot();
    const shop = await createSeller(prisma);
    const goods = await createProduct(prisma, {
      sellerId: shop.seller.id,
      priceCents: 3_000,
      stock: 5,
    });
    await call('post', '/cart/items', winner, { productId: goods.id, quantity: 2 });

    const response = await checkout(winner);

    expect(response.status).toBe(201);
    const order = response.body as OrderBody;
    expect(order.sellerOrders).toHaveLength(2);
    expect(order.totalCents).toBe(12_500 + 6_000);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: goods.id } })).stock).toBe(3);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe(
      'ORDERED',
    );
    await flushEvents();
  });

  it('offers the lot again when the winner does not check out in time, and refuses the old winner', async () => {
    const { auction, winner, other } = await wonLot();
    await prisma.auction.update({
      where: { id: auction.id },
      data: { winnerDeadlineAt: new Date(Date.now() - 1_000) },
    });
    await waitUntil(
      async () =>
        (await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status === 'ACTIVE',
      { timeoutMs: 8_000, label: 'the sweeper to start a new round' },
    );

    const response = await checkout(winner);

    expect(response.status).toBe(409);
    expect((response.body as ErrorBody).error.code).toBe('CART_ITEMS_UNAVAILABLE');
    expect((response.body as ErrorBody).error.details?.items).toEqual([
      { productId: auction.productId, reason: 'UNAVAILABLE' },
    ]);
    expect((await cartOf(winner)).groups[0]?.items[0]?.availability).toBe('UNAVAILABLE');
    expect(await prisma.order.count()).toBe(0);
    const lateAdd = await call('post', '/cart/items', other, {
      productId: auction.productId,
      quantity: 1,
    });
    expect(lateAdd.status).toBe(403);
    const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(stored).toMatchObject({ round: 2, bidCount: 0, currentPriceCents: null });
    await queueOf(app, QUEUE.AUCTIONS).obliterate({ force: true });
  });

  it('starts a new round when the order with the lot is cancelled', async () => {
    const { auction, winner } = await wonLot();
    const order = (await checkout(winner)).body as OrderBody;
    const sellerOrderId = order.sellerOrders[0]?.id ?? '';

    const cancelled = await call(
      'post',
      `/orders/${order.id}/seller-orders/${sellerOrderId}/cancel`,
      winner,
    );
    await flushEvents();

    expect(cancelled.status).toBe(200);
    const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(stored).toMatchObject({
      status: 'ACTIVE',
      round: 2,
      currentPriceCents: null,
      highestBidId: null,
      bidCount: 0,
      winnerId: null,
    });
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: auction.productId } })).stock,
    ).toBe(1);
    const started = await prisma.outboxEvent.findMany({
      where: { eventType: 'auction.started', aggregateId: auction.id },
    });
    // The lot was set up without its first round's event, so the new round's is the only one.
    expect(started.map((event) => (event.payload as { round: number }).round)).toEqual([2]);
    expect(await prisma.bid.count({ where: { auctionId: auction.id, round: 1 } })).toBe(2);
    await queueOf(app, QUEUE.AUCTIONS).obliterate({ force: true });
  });

  describe('deleting a lot (I-16)', () => {
    const lotOf = async () => {
      const store = await createSeller(prisma);
      const product = await createProduct(prisma, {
        sellerId: store.seller.id,
        type: 'AUCTION',
        priceCents: null,
        stock: 1,
      });
      const auction = await createAuction(prisma, { productId: product.id });
      return { auction, seller: sellerOf(store) };
    };
    const remove = (seller: Caller, productId: string) =>
      call('delete', `/seller/products/${productId}`, seller);

    it('archives a lot without bids and closes the auction as not sold', async () => {
      const { auction, seller } = await lotOf();

      const response = await remove(seller, auction.productId);

      expect(response.status).toBe(204);
      const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      expect(stored.status).toBe('NOT_SOLD');
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: auction.productId } })).archivedAt,
      ).not.toBeNull();
      const closed = await prisma.outboxEvent.findMany({
        where: { eventType: 'auction.closed', aggregateId: auction.id },
      });
      expect(closed.map((event) => event.payload)).toEqual([
        {
          auctionId: auction.id,
          productId: auction.productId,
          sellerId: seller.sellerId,
          round: stored.round,
          outcome: 'NOT_SOLD',
          closedBy: 'ARCHIVE',
        },
      ]);
      await flushEvents();
      // The seller closed it themselves: no "ended without a sale" notification.
      expect(await prisma.notification.count({ where: { type: 'auction.closed' } })).toBe(0);
    });

    it('refuses to archive a lot that has bids', async () => {
      const { auction, seller } = await lotOf();
      const bidder = await createUser(prisma);
      await bid(auction.id, { id: bidder.id }, 10_000);

      const response = await remove(seller, auction.productId);

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe('PRODUCT_HAS_ACTIVE_AUCTION');
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe(
        'ACTIVE',
      );
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: auction.productId } })).archivedAt,
      ).toBeNull();
    });

    it('refuses to archive a lot whose winner has not checked out yet', async () => {
      const { auction, seller } = await wonLot();

      const response = await remove(seller, auction.productId);

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe('PRODUCT_HAS_ACTIVE_AUCTION');
    });
  });
});
