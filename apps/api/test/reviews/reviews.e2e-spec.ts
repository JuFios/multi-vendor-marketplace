import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Meilisearch } from 'meilisearch';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { MEILI_CLIENT } from '../../src/search/meili.constants';
import { SEARCH_PORT, type SearchPort } from '../../src/search/search.port';
import { bearerFor } from '../utils/auth';
import { createProduct, createSellerOrder } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';

const INDEX = 'test_products';

interface ErrorBody {
  error: { code: string };
}

interface ReviewBody {
  id: string;
  authorName: string;
  rating: number;
  text: string;
}

describe('Reviews (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let meili: Meilisearch;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    meili = app.get<Meilisearch>(MEILI_CLIENT);
  });

  beforeEach(async () => {
    await resetState(prisma);
    await meili.index(INDEX).deleteAllDocuments().waitTask();
  });

  afterAll(async () => {
    await resetState(prisma);
    await meili.index(INDEX).deleteAllDocuments().waitTask();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** A buyer with one item of a product, in the given seller order state. */
  const purchase = async (status: 'NEW' | 'COMPLETED' = 'COMPLETED') => {
    const bought = await createSellerOrder(prisma);
    if (status !== 'NEW') {
      await prisma.sellerOrder.update({ where: { id: bought.sellerOrder.id }, data: { status } });
    }
    const auth = await bearerFor(app, { id: bought.customer.id });
    return { ...bought, auth, productId: bought.item.productId };
  };

  const review = (productId: string, auth: string, body: object) =>
    http().post(`/api/products/${productId}/reviews`).set('Authorization', auth).send(body);

  it('refuses a customer who never bought the product', async () => {
    const { productId } = await purchase();
    const stranger = await bearerFor(app, {
      id: (await prisma.user.create({ data: { email: 'x@example.com', name: 'X' } })).id,
    });

    const response = await review(productId, stranger, { rating: 5, text: 'Great' }).expect(403);

    expect((response.body as ErrorBody).error.code).toBe('REVIEW_NOT_ALLOWED');
  });

  it('refuses while the seller order is not completed', async () => {
    const { productId, auth } = await purchase('NEW');

    const response = await review(productId, auth, { rating: 5, text: 'Great' }).expect(403);

    expect((response.body as ErrorBody).error.code).toBe('REVIEW_NOT_ALLOWED');
    const eligibility = await http()
      .get(`/api/products/${productId}/reviews/eligibility`)
      .set('Authorization', auth)
      .expect(200);
    expect(eligibility.body).toEqual({ eligible: false, reason: 'NOT_PURCHASED' });
  });

  it('refuses a buyer whose item was refunded in full, but not one who kept a unit', async () => {
    const full = await purchase();
    await prisma.sellerOrderItem.update({
      where: { id: full.item.id },
      data: { refundedQuantity: full.item.quantity, refundedCents: full.item.quantity * 10_000 },
    });
    const partial = await purchase();
    await prisma.sellerOrderItem.update({
      where: { id: partial.item.id },
      data: { refundedQuantity: partial.item.quantity - 1, refundedCents: 10_000 },
    });

    const refused = await review(full.productId, full.auth, { rating: 1, text: 'No' }).expect(403);
    expect((refused.body as ErrorBody).error.code).toBe('REVIEW_NOT_ALLOWED');
    await review(partial.productId, partial.auth, { rating: 4, text: 'Kept one' }).expect(201);
  });

  it('accepts a review after completion, updates the rating and the index', async () => {
    const { productId, auth } = await purchase();

    const created = await review(productId, auth, { rating: 4, text: 'Solid' }).expect(201);
    await flushEvents();

    expect(created.body).toMatchObject({ rating: 4, text: 'Solid', authorName: 'Test User' });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    // The version moves with the rating, or the indexer's post-write re-check would miss a
    // review that landed while it was writing.
    expect(product).toMatchObject({ ratingSum: 4, ratingCount: 1, version: 1 });
    expect(Number(product.ratingAvg)).toBe(4);
    const indexed = (
      await app.get<SearchPort>(SEARCH_PORT).search({
        sort: 'newest',
        page: 1,
        limit: 50,
      })
    ).items;
    expect(indexed).toEqual([expect.objectContaining({ id: productId, ratingAvg: 4 })]);
    const eligibility = await http()
      .get(`/api/products/${productId}/reviews/eligibility`)
      .set('Authorization', auth)
      .expect(200);
    expect(eligibility.body).toEqual({ eligible: false, reason: 'ALREADY_REVIEWED' });
  });

  it('rejects a second review of the same product', async () => {
    const { productId, auth } = await purchase();
    await review(productId, auth, { rating: 5, text: 'One' }).expect(201);

    const response = await review(productId, auth, { rating: 1, text: 'Two' }).expect(409);

    expect((response.body as ErrorBody).error.code).toBe('REVIEW_ALREADY_EXISTS');
    expect(await prisma.review.count()).toBe(1);
  });

  it('averages reviews of several buyers to two decimals and filters the catalog by it', async () => {
    const first = await purchase();
    const second = await createSellerOrder(prisma);
    await prisma.sellerOrderItem.update({
      where: { id: second.item.id },
      data: { productId: first.productId },
    });
    await prisma.sellerOrder.update({
      where: { id: second.sellerOrder.id },
      data: { status: 'COMPLETED' },
    });
    const third = await createSellerOrder(prisma);
    await prisma.sellerOrderItem.update({
      where: { id: third.item.id },
      data: { productId: first.productId },
    });
    await prisma.sellerOrder.update({
      where: { id: third.sellerOrder.id },
      data: { status: 'COMPLETED' },
    });
    const other = await createProduct(prisma);

    await review(first.productId, first.auth, { rating: 5, text: 'a' }).expect(201);
    await review(first.productId, await bearerFor(app, { id: second.customer.id }), {
      rating: 4,
      text: 'b',
    }).expect(201);
    await review(first.productId, await bearerFor(app, { id: third.customer.id }), {
      rating: 4,
      text: 'c',
    }).expect(201);
    await flushEvents();

    const product = await prisma.product.findUniqueOrThrow({ where: { id: first.productId } });
    expect(Number(product.ratingAvg)).toBe(4.33);
    expect(product.ratingCount).toBe(3);
    const filtered = await http().get('/api/catalog?ratingMin=4').expect(200);
    expect((filtered.body as { items: { id: string }[] }).items.map((item) => item.id)).toEqual([
      first.productId,
    ]);
    expect(other.id).not.toBe(first.productId);
  });

  it('lists reviews publicly with pagination', async () => {
    const { productId, auth } = await purchase();
    await review(productId, auth, { rating: 3, text: 'Fine' }).expect(201);

    const response = await http()
      .get(`/api/products/${productId}/reviews?page=1&limit=10`)
      .expect(200);

    const body = response.body as {
      items: ReviewBody[];
      total: number;
      page: number;
      limit: number;
    };
    expect(body).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(body.items[0]).toMatchObject({ rating: 3, text: 'Fine', authorName: 'Test User' });
  });

  it('answers 404 for reviews of an unpublished product', async () => {
    const product = await createProduct(prisma, { isPublished: false });

    await http().get(`/api/products/${product.id}/reviews`).expect(404);
  });

  it('validates the rating range', async () => {
    const { productId, auth } = await purchase();

    await review(productId, auth, { rating: 6, text: 'Too much' }).expect(400);
    await review(productId, auth, { rating: 0, text: 'Too little' }).expect(400);
    await review(productId, auth, { rating: 5, text: '   ' }).expect(400);
  });

  it('requires authentication to review', async () => {
    const { productId } = await purchase();

    await http()
      .post(`/api/products/${productId}/reviews`)
      .send({ rating: 5, text: 'x' })
      .expect(401);
  });

  it('strips markup from the text', async () => {
    const { productId, auth } = await purchase();

    const response = await review(productId, auth, {
      rating: 5,
      text: 'Nice <script>alert(1)</script><img src=x onerror=alert(2)> product',
    }).expect(201);

    expect((response.body as ReviewBody).text).toBe('Nice  product');
    const stored = await prisma.review.findFirstOrThrow();
    expect(stored.text).not.toMatch(/[<>]/);
  });
});
