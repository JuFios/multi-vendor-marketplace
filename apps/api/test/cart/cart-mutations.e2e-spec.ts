import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { UserRole } from '../../src/modules/users';
import { PrismaService } from '../../src/prisma';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface CartBody {
  groups: { items: { productId: string; quantity: number }[]; subtotalCents: number }[];
  totalCents: number;
  itemsCount: number;
}

interface ErrorBody {
  error: { code: string };
}

describe('Cart mutations (e2e)', () => {
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

  const call = async (
    method: 'post' | 'patch' | 'delete',
    path: string,
    user: { id: string; roles?: UserRole[]; sellerId?: string },
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/api/cart${path}`)
      .set('Authorization', await bearerFor(app, user));
    return body === undefined ? req : req.send(body);
  };

  const quantities = (body: CartBody): Record<string, number> =>
    Object.fromEntries(
      body.groups.flatMap((group) => group.items).map((item) => [item.productId, item.quantity]),
    );

  describe('POST /items', () => {
    it('creates the cart on the first add and returns it whole', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma, { priceCents: 1_200, stock: 10 });
      expect(await prisma.cart.count()).toBe(0);

      const response = await call('post', '/items', buyer, { productId: product.id, quantity: 2 });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ totalCents: 2_400, itemsCount: 2, sellerCount: 1 });
      const cart = await prisma.cart.findFirstOrThrow({ where: { userId: buyer.id } });
      expect(cart).toMatchObject({ status: 'ACTIVE' });
      expect(cart.firstItemAddedAt).not.toBeNull();
    });

    it('adds to the existing quantity and keeps firstItemAddedAt', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma, { stock: 10 });
      await call('post', '/items', buyer, { productId: product.id, quantity: 2 });
      const { firstItemAddedAt } = await prisma.cart.findFirstOrThrow();

      const response = await call('post', '/items', buyer, { productId: product.id, quantity: 3 });

      expect(quantities(response.body as CartBody)).toEqual({ [product.id]: 5 });
      expect((await prisma.cart.findFirstOrThrow()).firstItemAddedAt).toEqual(firstItemAddedAt);
      expect(await prisma.cart.count()).toBe(1);
    });

    it('does not lose units when two adds run at once', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma, { stock: 10 });

      const results = await Promise.all([
        call('post', '/items', buyer, { productId: product.id, quantity: 2 }),
        call('post', '/items', buyer, { productId: product.id, quantity: 3 }),
      ]);

      expect(results.map((result) => result.status)).toEqual([201, 201]);
      expect(await prisma.cart.count()).toBe(1);
      expect((await prisma.cartItem.findFirstOrThrow()).quantity).toBe(5);
    });

    it.each([0, -1, 100, 1.5, '2', null])('rejects quantity %p', async (quantity) => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma);

      const response = await call('post', '/items', buyer, { productId: product.id, quantity });

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a quantity above the stock with INSUFFICIENT_STOCK', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma, { stock: 3 });
      await call('post', '/items', buyer, { productId: product.id, quantity: 2 });

      const response = await call('post', '/items', buyer, { productId: product.id, quantity: 2 });

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe('INSUFFICIENT_STOCK');
      expect(
        quantities(
          (await call('post', '/items', buyer, { productId: product.id, quantity: 1 }))
            .body as CartBody,
        ),
      ).toEqual({ [product.id]: 3 });
    });

    it('rejects a line above 99 units', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma, { stock: 500 });
      await call('post', '/items', buyer, { productId: product.id, quantity: 60 });

      const response = await call('post', '/items', buyer, { productId: product.id, quantity: 40 });

      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe('CART_QUANTITY_LIMIT');
    });

    it('answers 404 for an unknown, archived or unpublished product', async () => {
      const buyer = await createUser(prisma);
      const archived = await createProduct(prisma, { archivedAt: new Date(), isPublished: false });
      const hidden = await createProduct(prisma, {
        isPublished: false,
        moderationStatus: 'PENDING',
      });

      for (const productId of [archived.id, hidden.id, '0190d1a0-0000-7000-8000-000000000000']) {
        const response = await call('post', '/items', buyer, { productId, quantity: 1 });
        expect(response.status).toBe(404);
      }
    });

    it('refuses an auction lot', async () => {
      const buyer = await createUser(prisma);
      const lot = await createProduct(prisma, { type: 'AUCTION', priceCents: null, stock: 1 });

      const response = await call('post', '/items', buyer, { productId: lot.id, quantity: 1 });

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('PRODUCT_NOT_FIXED_PRICE');
    });

    it('answers 422 CANNOT_BUY_OWN_PRODUCT to the seller of the product', async () => {
      const { user, seller } = await createSeller(prisma);
      const own = await createProduct(prisma, { sellerId: seller.id });

      const response = await call(
        'post',
        '/items',
        { id: user.id, roles: ['CUSTOMER', 'SELLER'], sellerId: seller.id },
        { productId: own.id, quantity: 1 },
      );

      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe('CANNOT_BUY_OWN_PRODUCT');
      expect(await prisma.cart.count()).toBe(0);
    });

    it('lets a seller buy another seller’s product', async () => {
      const { user, seller } = await createSeller(prisma);
      const foreign = await createProduct(prisma);

      const response = await call(
        'post',
        '/items',
        { id: user.id, roles: ['CUSTOMER', 'SELLER'], sellerId: seller.id },
        { productId: foreign.id, quantity: 1 },
      );

      expect(response.status).toBe(201);
    });

    it('requires a token', async () => {
      await request(app.getHttpServer()).post('/api/cart/items').send({}).expect(401);
    });
  });

  describe('PATCH /items/:productId', () => {
    it('sets the quantity and returns the whole cart', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma, { stock: 10, priceCents: 500 });
      await call('post', '/items', buyer, { productId: product.id, quantity: 2 });

      const response = await call('patch', `/items/${product.id}`, buyer, { quantity: 7 });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ totalCents: 3_500, itemsCount: 7 });
    });

    it('refuses to raise the quantity above the stock', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma, { stock: 4 });
      await call('post', '/items', buyer, { productId: product.id, quantity: 2 });

      const response = await call('patch', `/items/${product.id}`, buyer, { quantity: 5 });

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('lets the buyer lower a line whose stock has dropped', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma, { stock: 10 });
      await call('post', '/items', buyer, { productId: product.id, quantity: 6 });
      await prisma.product.update({ where: { id: product.id }, data: { stock: 2 } });

      const response = await call('patch', `/items/${product.id}`, buyer, { quantity: 2 });

      expect(response.status).toBe(200);
      expect(quantities(response.body as CartBody)).toEqual({ [product.id]: 2 });
    });

    it.each([0, 100])('rejects quantity %p', async (quantity) => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma);
      await call('post', '/items', buyer, { productId: product.id, quantity: 1 });

      const response = await call('patch', `/items/${product.id}`, buyer, { quantity });

      expect(response.status).toBe(400);
    });

    it('answers 404 for a product that is not in the caller’s cart, even if another has it', async () => {
      const owner = await createUser(prisma);
      const other = await createUser(prisma);
      const product = await createProduct(prisma);
      await call('post', '/items', owner, { productId: product.id, quantity: 1 });

      const withoutCart = await call('patch', `/items/${product.id}`, other, { quantity: 2 });
      await call('post', '/items', other, {
        productId: (await createProduct(prisma)).id,
        quantity: 1,
      });
      const withCart = await call('patch', `/items/${product.id}`, other, { quantity: 2 });

      expect([withoutCart.status, withCart.status]).toEqual([404, 404]);
      expect((withCart.body as ErrorBody).error.code).toBe('CART_ITEM_NOT_FOUND');
      expect(
        quantities(
          (await call('post', '/items', owner, { productId: product.id, quantity: 1 }))
            .body as CartBody,
        ),
      ).toEqual({ [product.id]: 2 });
    });
  });

  describe('DELETE', () => {
    it('removes one line and returns the rest', async () => {
      const buyer = await createUser(prisma);
      const keep = await createProduct(prisma);
      const drop = await createProduct(prisma);
      await call('post', '/items', buyer, { productId: keep.id, quantity: 1 });
      await call('post', '/items', buyer, { productId: drop.id, quantity: 1 });

      const response = await call('delete', `/items/${drop.id}`, buyer);

      expect(response.status).toBe(200);
      expect(quantities(response.body as CartBody)).toEqual({ [keep.id]: 1 });
      expect((await call('delete', `/items/${drop.id}`, buyer)).status).toBe(404);
    });

    it('can remove an archived product so the cart can be fixed', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma);
      await call('post', '/items', buyer, { productId: product.id, quantity: 1 });
      await prisma.product.update({
        where: { id: product.id },
        data: { archivedAt: new Date(), isPublished: false },
      });

      const response = await call('delete', `/items/${product.id}`, buyer);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ groups: [], itemsCount: 0 });
    });

    it('does not let another user remove a line', async () => {
      const owner = await createUser(prisma);
      const other = await createUser(prisma);
      const product = await createProduct(prisma);
      await call('post', '/items', owner, { productId: product.id, quantity: 1 });
      await call('post', '/items', other, {
        productId: (await createProduct(prisma)).id,
        quantity: 1,
      });

      expect((await call('delete', `/items/${product.id}`, other)).status).toBe(404);
      expect(await prisma.cartItem.count({ where: { productId: product.id } })).toBe(1);
    });

    it('empties the whole cart, and is harmless without one', async () => {
      const buyer = await createUser(prisma);
      const product = await createProduct(prisma);
      expect((await call('delete', '', buyer)).status).toBe(200);
      await call('post', '/items', buyer, { productId: product.id, quantity: 2 });

      const response = await call('delete', '', buyer);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ groups: [], totalCents: 0, itemsCount: 0, sellerCount: 0 });
      expect(await prisma.cartItem.count()).toBe(0);
    });
  });
});
