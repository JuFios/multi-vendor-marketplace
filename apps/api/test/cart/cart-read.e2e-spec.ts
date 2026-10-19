import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface CartBody {
  groups: {
    seller: { id: string; name: string };
    items: {
      productId: string;
      unitPriceCents: number;
      quantity: number;
      availability: string;
      lineTotalCents: number;
    }[];
    subtotalCents: number;
  }[];
  totalCents: number;
  itemsCount: number;
  sellerCount: number;
}

describe('GET /api/cart (e2e)', () => {
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
    const cart = await prisma.cart.create({
      data: { userId, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: lines.map((line, index) => ({
        cartId: cart.id,
        ...line,
        addedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      })),
    });
  };

  const getCart = async (user: { id: string }) =>
    request(app.getHttpServer())
      .get('/api/cart')
      .set('Authorization', await bearerFor(app, user));

  const cartOf = async (user: { id: string }): Promise<CartBody> => {
    const response = await getCart(user);
    expect(response.status).toBe(200);
    return response.body as CartBody;
  };

  it('requires a token', async () => {
    await request(app.getHttpServer()).get('/api/cart').expect(401);
  });

  it('is empty for a user without a cart', async () => {
    const user = await createUser(prisma);

    expect(await cartOf(user)).toEqual({
      groups: [],
      totalCents: 0,
      itemsCount: 0,
      sellerCount: 0,
    });
  });

  it('groups products of two sellers with the right subtotals', async () => {
    const buyer = await createUser(prisma);
    const { seller: first } = await createSeller(prisma, { storeName: 'First Shop' });
    const { seller: second } = await createSeller(prisma, { storeName: 'Second Shop' });
    const a = await createProduct(prisma, { sellerId: first.id, priceCents: 1_000 });
    const b = await createProduct(prisma, { sellerId: second.id, priceCents: 250 });
    const c = await createProduct(prisma, { sellerId: first.id, priceCents: 500 });
    await fillCart(buyer.id, [
      { productId: a.id, quantity: 2 },
      { productId: b.id, quantity: 3 },
      { productId: c.id, quantity: 1 },
    ]);

    const body = await cartOf(buyer);

    expect(body.groups).toHaveLength(2);
    expect(body.groups[0]).toMatchObject({
      seller: { id: first.id, name: 'First Shop' },
      subtotalCents: 2_500,
    });
    expect(body.groups[0]?.items.map((item) => item.lineTotalCents)).toEqual([2_000, 500]);
    expect(body.groups[1]).toMatchObject({
      seller: { id: second.id, name: 'Second Shop' },
      subtotalCents: 750,
    });
    expect(body).toMatchObject({ totalCents: 3_250, itemsCount: 6, sellerCount: 2 });
    expect(
      body.groups
        .flatMap((group) => group.items)
        .every((item) => item.availability === 'AVAILABLE'),
    ).toBe(true);
  });

  it('shows an archived product as UNAVAILABLE and low stock as INSUFFICIENT_STOCK', async () => {
    const buyer = await createUser(prisma);
    const archived = await createProduct(prisma, { archivedAt: new Date(), isPublished: false });
    const scarce = await createProduct(prisma, { stock: 5 });
    await fillCart(buyer.id, [
      { productId: archived.id, quantity: 1 },
      { productId: scarce.id, quantity: 4 },
    ]);
    await prisma.product.update({ where: { id: scarce.id }, data: { stock: 3 } });

    const body = await cartOf(buyer);

    const availability = Object.fromEntries(
      body.groups
        .flatMap((group) => group.items)
        .map((item) => [item.productId, item.availability]),
    );
    expect(availability).toEqual({
      [archived.id]: 'UNAVAILABLE',
      [scarce.id]: 'INSUFFICIENT_STOCK',
    });
  });

  it('uses the current price, not the price at the time of adding', async () => {
    const buyer = await createUser(prisma);
    const product = await createProduct(prisma, { priceCents: 1_000 });
    await fillCart(buyer.id, [{ productId: product.id, quantity: 2 }]);
    await prisma.product.update({ where: { id: product.id }, data: { priceCents: 1_500 } });

    const body = await cartOf(buyer);

    expect(body.groups[0]?.items[0]).toMatchObject({
      unitPriceCents: 1_500,
      lineTotalCents: 3_000,
    });
  });

  it('never shows one user the items of another', async () => {
    const owner = await createUser(prisma);
    const other = await createUser(prisma);
    const product = await createProduct(prisma);
    await fillCart(owner.id, [{ productId: product.id, quantity: 1 }]);

    const body = await cartOf(other);

    expect(body).toMatchObject({ groups: [], itemsCount: 0 });
  });
});
