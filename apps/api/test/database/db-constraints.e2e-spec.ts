import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDb } from '../utils/db';
import {
  createAuction,
  createCategory,
  createProduct,
  createSeller,
  createSellerOrder,
  createUser,
} from '../utils/factories';
import { createTestApp } from '../utils/test-app';

describe('DB constraints (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('users', () => {
    it('stores emails lower-cased only', async () => {
      await expect(createUser(prisma, { email: 'Mixed.Case@Example.com' })).rejects.toThrow(
        /users_email_lowercase/,
      );
      await expect(createUser(prisma, { email: 'lower@example.com' })).resolves.toBeDefined();
    });

    it('stores identity emails lower-cased only', async () => {
      const user = await createUser(prisma);

      await expect(
        prisma.authIdentity.create({
          data: { userId: user.id, provider: 'GOOGLE', providerUserId: 'sub-1', email: 'A@B.com' },
        }),
      ).rejects.toThrow(/auth_identities_email_lowercase/);
    });
  });

  describe('products', () => {
    it('does not let stock become negative', async () => {
      const product = await createProduct(prisma, { stock: 1 });

      await expect(
        prisma.product.update({ where: { id: product.id }, data: { stock: { decrement: 2 } } }),
      ).rejects.toThrow(/products_stock_non_negative/);
    });

    it('rejects a non-positive price but allows a missing one', async () => {
      await expect(createProduct(prisma, { priceCents: 0 })).rejects.toThrow(
        /products_price_cents_positive/,
      );
      await expect(
        createProduct(prisma, { type: 'AUCTION', priceCents: null, stock: 1 }),
      ).resolves.toBeDefined();
    });
  });

  describe('carts', () => {
    it('rejects a second ACTIVE cart for the same user', async () => {
      const user = await createUser(prisma);
      await prisma.cart.create({ data: { userId: user.id } });

      await expect(prisma.cart.create({ data: { userId: user.id } })).rejects.toThrow(
        /carts_one_active_per_user_key/,
      );
    });

    it('allows a new ACTIVE cart once the previous one is converted', async () => {
      const user = await createUser(prisma);
      await prisma.cart.create({ data: { userId: user.id, status: 'CONVERTED' } });

      await expect(prisma.cart.create({ data: { userId: user.id } })).resolves.toBeDefined();
    });

    it('rejects a cart item with a non-positive quantity', async () => {
      const user = await createUser(prisma);
      const cart = await prisma.cart.create({ data: { userId: user.id } });
      const product = await createProduct(prisma);

      await expect(
        prisma.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: 0 } }),
      ).rejects.toThrow(/cart_items_quantity_positive/);
    });
  });

  describe('reviews', () => {
    it('rejects a rating outside 1..5', async () => {
      const { item, customer } = await createSellerOrder(prisma);

      await expect(
        prisma.review.create({
          data: {
            productId: item.productId,
            authorId: customer.id,
            sellerOrderItemId: item.id,
            rating: 6,
            text: 'Too good to be true',
          },
        }),
      ).rejects.toThrow(/reviews_rating_range/);
    });
  });

  describe('orders', () => {
    it('rejects refunded_quantity above quantity', async () => {
      const { item } = await createSellerOrder(prisma, { quantity: 2 });

      await expect(
        prisma.sellerOrderItem.update({ where: { id: item.id }, data: { refundedQuantity: 3 } }),
      ).rejects.toThrow(/seller_order_items_refunded_quantity_range/);
    });

    it('rejects a non-positive item quantity', async () => {
      const { sellerOrder, item } = await createSellerOrder(prisma);

      await expect(
        prisma.sellerOrderItem.create({
          data: {
            sellerOrderId: sellerOrder.id,
            productId: item.productId,
            titleSnapshot: 'Broken',
            unitPriceCents: 100,
            quantity: 0,
          },
        }),
      ).rejects.toThrow(/seller_order_items_quantity_positive/);
    });

    it('rejects refunded_cents above the seller order subtotal', async () => {
      const { sellerOrder } = await createSellerOrder(prisma, {
        quantity: 1,
        unitPriceCents: 5_000,
      });

      await expect(
        prisma.sellerOrder.update({
          where: { id: sellerOrder.id },
          data: { refundedCents: 5_001 },
        }),
      ).rejects.toThrow(/seller_orders_refunded_cents_range/);
    });
  });

  describe('disputes', () => {
    it('rejects a second open dispute on the same seller order', async () => {
      const { order, sellerOrder, customer } = await createSellerOrder(prisma);
      const data = {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        customerId: customer.id,
        sellerId: sellerOrder.sellerId,
        reason: 'Item not as described',
      };
      await prisma.dispute.create({ data });

      await expect(prisma.dispute.create({ data })).rejects.toThrow(
        /disputes_one_open_per_seller_order_key/,
      );
    });

    it('allows a new dispute once the previous one is resolved', async () => {
      const { order, sellerOrder, customer } = await createSellerOrder(prisma);
      const data = {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        customerId: customer.id,
        sellerId: sellerOrder.sellerId,
        reason: 'Item not as described',
      };
      await prisma.dispute.create({ data: { ...data, status: 'RESOLVED_SELLER_FAVOR' } });

      await expect(prisma.dispute.create({ data })).resolves.toBeDefined();
    });
  });

  describe('auctions', () => {
    it('rejects non-positive start price and bid step', async () => {
      await expect(createAuction(prisma, { bidStepCents: 0 })).rejects.toThrow(
        /auctions_amounts_positive/,
      );
      await expect(createAuction(prisma, { startPriceCents: 0 })).rejects.toThrow(
        /auctions_amounts_positive/,
      );
    });

    it('allows only one auction per product', async () => {
      const auction = await createAuction(prisma);

      await expect(createAuction(prisma, { productId: auction.productId })).rejects.toThrow();
    });
  });

  describe('ownership relations', () => {
    it('keeps the seller of a product restricted from deletion', async () => {
      const { seller } = await createSeller(prisma);
      const category = await createCategory(prisma);
      await createProduct(prisma, { sellerId: seller.id, categoryId: category.id });

      await expect(prisma.sellerProfile.delete({ where: { id: seller.id } })).rejects.toThrow();
    });
  });
});
