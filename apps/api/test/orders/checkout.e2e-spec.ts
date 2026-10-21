import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import request from 'supertest';

import { InventoryService } from '../../src/modules/products/inventory.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { AppTransactionHost } from '../../src/prisma/transaction';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface OrderBody {
  id: string;
  status: string;
  subtotalCents: number;
  totalCents: number;
  commissionCents: number;
  sellerOrders: {
    id: string;
    seller: { id: string };
    status: string;
    paymentStatus: string;
    subtotalCents: number;
    commissionRateBps: number;
    commissionCents: number;
    payoutCents: number;
    items: { productId: string; unitPriceCents: number; quantity: number; title: string }[];
    statusHistory: { from: string | null; to: string; actor: string }[];
  }[];
}

interface ErrorBody {
  error: { code: string; details?: { items: { productId: string; reason: string }[] } };
}

describe('POST /api/orders/checkout (e2e)', () => {
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

  const fillCart = async (userId: string, lines: { productId: string; quantity: number }[]) => {
    const cart = await prisma.cart.create({ data: { userId, firstItemAddedAt: new Date() } });
    await prisma.cartItem.createMany({ data: lines.map((line) => ({ cartId: cart.id, ...line })) });
    return cart;
  };

  const checkout = async (user: { id: string }, key: string | null = randomUUID()) => {
    const req = request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, user));
    return key === null ? req : req.set('Idempotency-Key', key);
  };

  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  it('splits a three-seller cart into one order and three seller orders', async () => {
    const buyer = await createUser(prisma);
    const first = await createProduct(prisma, { priceCents: 5_000, stock: 10 });
    const second = await createProduct(prisma, { priceCents: 3_335, stock: 4 });
    const third = await createProduct(prisma, { priceCents: 100, stock: 7 });
    await fillCart(buyer.id, [
      { productId: first.id, quantity: 2 },
      { productId: second.id, quantity: 3 },
      { productId: third.id, quantity: 1 },
    ]);

    const response = await checkout(buyer);

    expect(response.status).toBe(201);
    const body = response.body as OrderBody;
    expect(body).toMatchObject({
      status: 'NEW',
      subtotalCents: 10_000 + 10_005 + 100,
      totalCents: 20_105,
    });
    expect(body.sellerOrders).toHaveLength(3);
    const bySeller = new Map(body.sellerOrders.map((so) => [so.seller.id, so]));
    expect(bySeller.get(first.sellerId)).toMatchObject({
      status: 'NEW',
      paymentStatus: 'PENDING',
      subtotalCents: 10_000,
      commissionRateBps: 1000,
      commissionCents: 1_000,
      payoutCents: 9_000,
    });
    // 10_005 * 10% = 1_000.5 rounds half up.
    expect(bySeller.get(second.sellerId)).toMatchObject({
      commissionCents: 1_001,
      payoutCents: 9_004,
    });
    expect(bySeller.get(third.sellerId)).toMatchObject({ commissionCents: 10, payoutCents: 90 });
    expect(bySeller.get(second.sellerId)?.items).toEqual([
      expect.objectContaining({
        productId: second.id,
        unitPriceCents: 3_335,
        quantity: 3,
        title: second.title,
      }),
    ]);
    expect(bySeller.get(first.sellerId)?.statusHistory).toEqual([
      expect.objectContaining({ from: null, to: 'NEW', actor: 'CUSTOMER' }),
    ]);
    expect(body.commissionCents).toBe(1_000 + 1_001 + 10);

    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.sellerOrder.count()).toBe(3);
    expect(await stockOf(first.id)).toBe(8);
    expect(await stockOf(second.id)).toBe(1);
    expect(await stockOf(third.id)).toBe(6);

    const ledger = await prisma.ledgerEntry.findMany();
    expect(ledger).toHaveLength(6);
    for (const so of body.sellerOrders) {
      const entries = ledger.filter((entry) => entry.sellerOrderId === so.id);
      expect(entries.map((entry) => [entry.type, entry.amountCents]).sort()).toEqual(
        [
          ['COMMISSION', -so.commissionCents],
          ['SALE', so.subtotalCents],
        ].sort(),
      );
    }

    const cart = await prisma.cart.findFirstOrThrow({ where: { userId: buyer.id } });
    expect(cart).toMatchObject({ status: 'CONVERTED', convertedOrderId: body.id });
    expect(cart.convertedAt).not.toBeNull();

    const events = await prisma.outboxEvent.findMany();
    expect(events.filter((event) => event.eventType === 'seller_order.created')).toHaveLength(3);
    expect(events.filter((event) => event.eventType === 'product.stock_changed')).toHaveLength(3);
    expect(
      events.every(
        (event) => event.actorId === buyer.id || event.eventType !== 'seller_order.created',
      ),
    ).toBe(true);

    const metrics = (await request(app.getHttpServer()).get('/metrics')).text;
    expect(metrics).toMatch(/^orders_created_total 1$/m);
  });

  it('stamps convertedAt with the database clock, not the application clock', async () => {
    const buyer = await createUser(prisma);
    const product = await createProduct(prisma, { priceCents: 1_000, stock: 10 });
    await fillCart(buyer.id, [{ productId: product.id, quantity: 1 }]);

    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'performance',
        'hrtime',
        'queueMicrotask',
      ],
    });
    jest.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1_000));
    let status: number;
    try {
      status = (await checkout(buyer)).status;
    } finally {
      jest.useRealTimers();
    }

    expect(status).toBe(201);
    const [clock] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    const cart = await prisma.cart.findFirstOrThrow({ where: { userId: buyer.id } });
    expect(cart.convertedAt).not.toBeNull();
    expect(Math.abs(cart.convertedAt!.getTime() - clock!.now.getTime())).toBeLessThan(60_000);
  });

  it('prices the order with the current price, not the price when the item was added', async () => {
    const buyer = await createUser(prisma);
    const product = await createProduct(prisma, { priceCents: 1_000 });
    await fillCart(buyer.id, [{ productId: product.id, quantity: 2 }]);
    await prisma.product.update({ where: { id: product.id }, data: { priceCents: 1_500 } });

    const body = (await checkout(buyer)).body as OrderBody;

    expect(body.sellerOrders[0]?.items[0]).toMatchObject({ unitPriceCents: 1_500 });
    expect(body.totalCents).toBe(3_000);
  });

  it('answers 422 ORDER_TOTAL_LIMIT when a price rise pushes the total past the money columns', async () => {
    const buyer = await createUser(prisma);
    const product = await createProduct(prisma, { priceCents: 21_000_000, stock: 99 });
    // Valid when added (21 000 000 × 99 fits int32); the seller raises the price before checkout.
    await fillCart(buyer.id, [{ productId: product.id, quantity: 99 }]);
    await prisma.product.update({ where: { id: product.id }, data: { priceCents: 21_700_000 } });

    const response = await checkout(buyer);

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).error.code).toBe('ORDER_TOTAL_LIMIT');
    expect(await prisma.order.count()).toBe(0);
    expect(await stockOf(product.id)).toBe(99);
    expect((await prisma.cart.findFirstOrThrow()).status).toBe('ACTIVE');
  });

  it('answers 400 CART_EMPTY without a cart and after the cart was already turned into an order', async () => {
    const buyer = await createUser(prisma);
    const product = await createProduct(prisma);

    const none = await checkout(buyer);
    expect(none.status).toBe(400);
    expect((none.body as ErrorBody).error.code).toBe('CART_EMPTY');

    await fillCart(buyer.id, [{ productId: product.id, quantity: 1 }]);
    expect((await checkout(buyer)).status).toBe(201);
    const again = await checkout(buyer);
    expect(again.status).toBe(400);
    expect((again.body as ErrorBody).error.code).toBe('CART_EMPTY');
    expect(await prisma.order.count()).toBe(1);
  });

  it('lists every unavailable item in 409 CART_ITEMS_UNAVAILABLE and changes nothing', async () => {
    const buyer = await createUser(prisma);
    const archived = await createProduct(prisma, { archivedAt: new Date(), isPublished: false });
    const scarce = await createProduct(prisma, { stock: 1 });
    const fine = await createProduct(prisma, { stock: 10 });
    await fillCart(buyer.id, [
      { productId: archived.id, quantity: 1 },
      { productId: scarce.id, quantity: 3 },
      { productId: fine.id, quantity: 2 },
    ]);

    const response = await checkout(buyer);

    expect(response.status).toBe(409);
    const { error } = response.body as ErrorBody;
    expect(error.code).toBe('CART_ITEMS_UNAVAILABLE');
    expect(error.details?.items).toEqual(
      expect.arrayContaining([
        { productId: archived.id, reason: 'UNAVAILABLE' },
        { productId: scarce.id, reason: 'INSUFFICIENT_STOCK' },
      ]),
    );
    expect(error.details?.items).toHaveLength(2);
    expect(await stockOf(fine.id)).toBe(10);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.outboxEvent.count()).toBe(0);
    expect((await prisma.cart.findFirstOrThrow()).status).toBe('ACTIVE');
  });

  it('takes stock for all products or for none when one of them runs short mid-checkout', async () => {
    const plenty = await createProduct(prisma, { stock: 10 });
    const scarce = await createProduct(prisma, { stock: 1 });
    const inventory = app.get(InventoryService);
    const txHost = app.get<AppTransactionHost>(TransactionHost);

    // The reservations run in id order, so one of them is already taken when the other fails.
    await expect(
      txHost.withTransaction(() =>
        inventory.reserve([
          { productId: plenty.id, quantity: 3 },
          { productId: scarce.id, quantity: 2 },
        ]),
      ),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { items: [{ productId: scarce.id, requested: 2, available: 1 }] },
    });

    expect(await stockOf(plenty.id)).toBe(10);
    expect(await stockOf(scarce.id)).toBe(1);
    expect(await prisma.outboxEvent.count()).toBe(0);
  });

  it('lets exactly five of twenty parallel buyers have the last five units', async () => {
    const product = await createProduct(prisma, { stock: 5 });
    const buyers = await Promise.all(Array.from({ length: 20 }, () => createUser(prisma)));
    for (const buyer of buyers) {
      await fillCart(buyer.id, [{ productId: product.id, quantity: 1 }]);
    }

    const responses = await Promise.all(buyers.map((buyer) => checkout(buyer)));

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(5);
    expect(statuses.filter((status) => status === 409)).toHaveLength(15);
    expect(await stockOf(product.id)).toBe(0);
    expect(await prisma.order.count()).toBe(5);
    expect(await prisma.sellerOrderItem.aggregate({ _sum: { quantity: true } })).toMatchObject({
      _sum: { quantity: 5 },
    });
    expect(await prisma.cart.count({ where: { status: 'CONVERTED' } })).toBe(5);
  });

  it('is idempotent: the same key twice gives one order and the same response', async () => {
    const buyer = await createUser(prisma);
    const product = await createProduct(prisma, { stock: 10 });
    await fillCart(buyer.id, [{ productId: product.id, quantity: 2 }]);
    const key = randomUUID();

    const first = await checkout(buyer, key);
    const second = await checkout(buyer, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(await prisma.order.count()).toBe(1);
    expect(await stockOf(product.id)).toBe(8);
  });

  it('requires an Idempotency-Key and a token', async () => {
    const buyer = await createUser(prisma);

    const noKey = await checkout(buyer, null);
    expect(noKey.status).toBe(400);
    expect((noKey.body as ErrorBody).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Idempotency-Key', randomUUID())
      .expect(401);
  });

  it('lets a seller buy from another seller', async () => {
    const { user, seller } = await createSeller(prisma);
    const foreign = await createProduct(prisma);
    await fillCart(user.id, [{ productId: foreign.id, quantity: 1 }]);

    const response = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set(
        'Authorization',
        await bearerFor(app, { id: user.id, roles: ['CUSTOMER', 'SELLER'], sellerId: seller.id }),
      )
      .set('Idempotency-Key', randomUUID());

    expect(response.status).toBe(201);
  });
});
