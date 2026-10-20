import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { CORRELATION_ID_REQUEST_HEADER } from '../../src/common/cls/correlation-id';
import type {
  AuctionStatePayload,
  NotificationPayload,
  OrderStatusPayload,
  ProductStockPayload,
  SellerOrderCreatedPayload,
  SellerOrderStatusPayload,
} from '../../src/modules/notifications/ws-events';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createAuction, createProduct, createSeller, createUser } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { createTestApp } from '../utils/test-app';
import { connectSocket, listenOn, type TestSocket } from '../utils/ws-client';

const SETTLE_MS = 300;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

describe('Realtime pushes (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let url: string;
  const open: TestSocket[] = [];

  const connect = async (caller?: {
    id: string;
    roles?: ('CUSTOMER' | 'SELLER' | 'ADMIN')[];
    sellerId?: string;
  }): Promise<TestSocket> => {
    const token =
      caller === undefined ? undefined : (await bearerFor(app, caller)).slice('Bearer '.length);
    const client = await connectSocket(url, token);
    open.push(client);
    return client;
  };

  const asSeller = (store: Awaited<ReturnType<typeof createSeller>>) => ({
    id: store.user.id,
    roles: ['CUSTOMER', 'SELLER'] as ('CUSTOMER' | 'SELLER')[],
    sellerId: store.seller.id,
  });

  const checkout = async (buyerId: string, productId: string, quantity = 1) => {
    const cart = await prisma.cart.create({
      data: { userId: buyerId, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity } });
    const response = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, { id: buyerId }))
      .set('Idempotency-Key', randomUUID());
    expect(response.status).toBe(201);
    return response.body as { id: string; sellerOrders: { id: string }[] };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    url = await listenOn(app);
  });

  beforeEach(() => resetDb(prisma));

  afterEach(() => {
    for (const client of open.splice(0)) {
      client.close();
    }
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  it('pushes the new price and a higher version to everyone following an auction', async () => {
    const auction = await createAuction(prisma);
    const bidder = await createUser(prisma);
    const correlationId = randomUUID();
    const watcher = await connect();
    const before = (await watcher.subscribe('auction', auction.id)) as {
      snapshot: { state: AuctionStatePayload };
    };

    const response = await request(app.getHttpServer())
      .post(`/api/auctions/${auction.id}/bids`)
      .set('Authorization', await bearerFor(app, { id: bidder.id }))
      .set('Idempotency-Key', randomUUID())
      .set(CORRELATION_ID_REQUEST_HEADER, correlationId)
      .send({ amountCents: 10_000 });
    expect(response.status).toBe(201);
    await flushEvents();

    const pushed = await watcher.waitForEvent<AuctionStatePayload>('auction.state');
    expect(pushed).toMatchObject({
      auctionId: auction.id,
      status: 'ACTIVE',
      currentPriceCents: 10_000,
      minNextBidCents: 10_500,
      bidCount: 1,
    });
    expect(pushed.version).toBeGreaterThan(before.snapshot.state.version);
    expect(pushed.correlationId).toBe(correlationId);
    expect(pushed.leader).toMatch(/^Bidder #/);
  });

  it('pushes product.stock to followers of a product after a checkout', async () => {
    const product = await createProduct(prisma, { stock: 5 });
    const buyer = await createUser(prisma);
    const watcher = await connect();
    const other = await connect();
    await watcher.subscribe('product', product.id);

    await checkout(buyer.id, product.id, 2);
    await flushEvents();

    const pushed = await watcher.waitForEvent<ProductStockPayload>('product.stock');
    expect(pushed).toMatchObject({ productId: product.id, stock: 3, inStock: true });
    expect(pushed.version).toBeGreaterThan(product.version);
    await settle();
    expect(other.eventsOf('product.stock')).toEqual([]);
  });

  it('tells the store about a new seller order and the buyer only about their own order', async () => {
    const store = await createSeller(prisma);
    const product = await createProduct(prisma, { sellerId: store.seller.id });
    const buyer = await createUser(prisma);
    const stranger = await createUser(prisma);
    const sellerSocket = await connect(asSeller(store));
    const buyerSocket = await connect({ id: buyer.id });
    const strangerSocket = await connect({ id: stranger.id });

    const order = await checkout(buyer.id, product.id);
    await flushEvents();

    const created =
      await sellerSocket.waitForEvent<SellerOrderCreatedPayload>('sellerOrder.created');
    expect(created).toMatchObject({
      sellerOrderId: order.sellerOrders[0]?.id,
      orderId: order.id,
      status: 'NEW',
    });

    const ship = await request(app.getHttpServer())
      .post(`/api/seller/orders/${order.sellerOrders[0]?.id}/status`)
      .set('Authorization', await bearerFor(app, asSeller(store)))
      .send({ status: 'PROCESSING' });
    expect(ship.status).toBe(200);
    await flushEvents();

    const forBuyer = await buyerSocket.waitForEvent<OrderStatusPayload>('order.status');
    expect(forBuyer).toMatchObject({
      orderId: order.id,
      status: 'PROCESSING',
      sellerOrderId: order.sellerOrders[0]?.id,
      sellerOrderStatus: 'PROCESSING',
    });
    const forStore =
      await sellerSocket.waitForEvent<SellerOrderStatusPayload>('sellerOrder.status');
    expect(forStore).toMatchObject({ orderId: order.id, status: 'PROCESSING' });
    expect(forStore.version).toBeGreaterThan(created.version);
    await settle();
    expect(strangerSocket.received).toEqual([]);
    expect(buyerSocket.eventsOf('sellerOrder.created')).toEqual([]);
  });

  it('pushes the stored notification to its owner', async () => {
    const store = await createSeller(prisma);
    const product = await createProduct(prisma, { sellerId: store.seller.id });
    const buyer = await createUser(prisma);
    const sellerSocket = await connect(asSeller(store));
    const buyerSocket = await connect({ id: buyer.id });

    await checkout(buyer.id, product.id);
    await flushEvents();

    const pushed = await sellerSocket.waitForEvent<NotificationPayload>('notification');
    const stored = await prisma.notification.findFirstOrThrow({ where: { userId: store.user.id } });
    expect(pushed).toMatchObject({ id: stored.id, type: 'seller_order.created' });
    await settle();
    expect(buyerSocket.eventsOf('notification')).toEqual([]);
  });
});
