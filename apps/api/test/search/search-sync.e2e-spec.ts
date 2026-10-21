import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Redis } from 'ioredis';
import type { Meilisearch } from 'meilisearch';
import request from 'supertest';

import { SearchBootstrap } from '../../src/modules/search-sync/search-bootstrap.service';
import { SearchIndexer } from '../../src/modules/search-sync/search-indexer.service';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import { OutboxService } from '../../src/outbox/outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { AppTransactionHost } from '../../src/prisma/transaction';
import { REDIS_CLIENT } from '../../src/redis/redis.constants';
import { CATALOG_SCHEMA_VERSION, type CatalogQuery } from '../../src/search/catalog';
import { MEILI_CLIENT } from '../../src/search/meili.constants';
import { SEARCH_PORT, type SearchPort } from '../../src/search/search.port';
import { bearerFor } from '../utils/auth';
import { createCategory, createProduct, createSeller, createUser } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';

const INDEX = 'test_products';
const all: CatalogQuery = { sort: 'newest', page: 1, limit: 50 };

describe('search index synchronization (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let search: SearchPort;
  let meili: Meilisearch;
  let redis: Redis;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    search = app.get<SearchPort>(SEARCH_PORT);
    meili = app.get<Meilisearch>(MEILI_CLIENT);
    redis = app.get<Redis>(REDIS_CLIENT);
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
  const indexed = async () => (await search.search(all)).items;

  const sellerAuth = async () => {
    const { user, seller } = await createSeller(prisma, { storeName: 'Sync Shop' });
    const auth = await bearerFor(app, {
      id: user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: seller.id,
    });
    return { seller, auth };
  };

  const publishUpdated = (productId: string) =>
    app.get<AppTransactionHost>(TransactionHost).withTransaction(() =>
      app.get(OutboxService).add([
        {
          type: EVENT_TYPE.PRODUCT_UPDATED,
          aggregateType: 'Product',
          aggregateId: productId,
          payload: { productId, version: 1, changed: ['title'] },
        },
      ]),
    );

  it('indexes a product created through the API, with category and store names', async () => {
    const { auth } = await sellerAuth();
    const category = await createCategory(prisma, { name: 'Phones' });

    const response = await http()
      .post('/api/seller/products')
      .set('Authorization', auth)
      .send({
        type: 'FIXED_PRICE',
        categoryId: category.id,
        title: 'Smartphone X',
        description: 'Fast',
        priceCents: 30_000,
        stock: 2,
      })
      .expect(201);
    await flushEvents();

    const items = await indexed();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: (response.body as { id: string }).id,
      title: 'Smartphone X',
      categoryName: 'Phones',
      sellerName: 'Sync Shop',
      priceCents: 30_000,
      inStock: true,
    });
  });

  it('follows price, stock and archive changes made through the API', async () => {
    const { seller, auth } = await sellerAuth();
    const product = await createProduct(prisma, { sellerId: seller.id, priceCents: 1_000 });
    await publishUpdated(product.id);
    await flushEvents();
    expect(await indexed()).toHaveLength(1);

    await http()
      .patch(`/api/seller/products/${product.id}`)
      .set('Authorization', auth)
      .send({ priceCents: 2_000 })
      .expect(200);
    await http()
      .patch(`/api/seller/products/${product.id}/stock`)
      .set('Authorization', auth)
      .send({ stock: 0 })
      .expect(200);
    await flushEvents();
    expect((await indexed())[0]).toMatchObject({ priceCents: 2_000, inStock: false, stock: 0 });

    await http()
      .delete(`/api/seller/products/${product.id}`)
      .set('Authorization', auth)
      .expect(204);
    await flushEvents();
    expect(await indexed()).toEqual([]);
  });

  it('prices a lot from its auction when it starts and after a bid', async () => {
    const { auth } = await sellerAuth();
    const category = await createCategory(prisma, { name: 'Collectibles' });

    const response = await http()
      .post('/api/seller/products')
      .set('Authorization', auth)
      .send({
        type: 'AUCTION',
        categoryId: category.id,
        title: 'Vintage camera',
        description: 'Works',
        startPriceCents: 10_000,
        bidStepCents: 500,
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
    const lot = response.body as { id: string; auctionId: string };
    await flushEvents();

    expect((await indexed())[0]).toMatchObject({
      id: lot.id,
      type: 'AUCTION',
      priceCents: 10_000,
      inStock: true,
      auctionId: lot.auctionId,
      auctionStatus: 'ACTIVE',
    });

    const bidder = await createUser(prisma);
    await http()
      .post(`/api/auctions/${lot.auctionId}/bids`)
      .set('Authorization', await bearerFor(app, { id: bidder.id }))
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents: 10_500 })
      .expect(201);
    await flushEvents();

    expect((await indexed())[0]).toMatchObject({ priceCents: 10_500, inStock: true });
  });

  it('removes a product that an admin rejects', async () => {
    const { seller } = await sellerAuth();
    const product = await createProduct(prisma, {
      sellerId: seller.id,
      moderationStatus: 'PENDING',
    });
    await publishUpdated(product.id);
    await flushEvents();
    expect(await indexed()).toHaveLength(1);
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });

    await http()
      .post(`/api/admin/products/${product.id}/reject`)
      .set('Authorization', await bearerFor(app, { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] }))
      .send({ reason: 'No' })
      .expect(200);
    await flushEvents();

    expect(await indexed()).toEqual([]);
  });

  it('keeps a single, current document when the same event is delivered twice', async () => {
    const product = await createProduct(prisma, { title: 'Old title' });
    await publishUpdated(product.id);
    await flushEvents();
    await prisma.product.update({ where: { id: product.id }, data: { title: 'New title' } });

    await publishUpdated(product.id);
    await publishUpdated(product.id);
    await flushEvents();

    const items = await indexed();
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('New title');
  });

  it('renames the category in every product document after category.updated', async () => {
    const category = await createCategory(prisma, { name: 'Old name' });
    await createProduct(prisma, { categoryId: category.id });
    await createProduct(prisma, { categoryId: category.id });
    const other = await createProduct(prisma);
    await app.get(SearchIndexer).reindexAll({ clear: true });
    const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });

    await http()
      .patch(`/api/admin/categories/${category.id}`)
      .set('Authorization', await bearerFor(app, { id: admin.id, roles: ['CUSTOMER', 'ADMIN'] }))
      .send({ name: 'New name' })
      .expect(200);
    await flushEvents();

    const items = await indexed();
    const inCategory = items.filter((item) => item.categoryId === category.id);
    expect(inCategory).toHaveLength(2);
    expect(inCategory.every((item) => item.categoryName === 'New name')).toBe(true);
    expect(items.find((item) => item.id === other.id)?.categoryName).not.toBe('New name');
  });

  it('raises the catalog cache namespace after the index changed', async () => {
    const before = Number((await redis.get('cache:catalog:ns')) ?? 0);
    const product = await createProduct(prisma);

    await publishUpdated(product.id);
    await flushEvents();

    expect(Number(await redis.get('cache:catalog:ns'))).toBeGreaterThan(before);
  });

  describe('full reindex', () => {
    it('rebuilds the index from the database and drops documents of products that are gone', async () => {
      const kept = await createProduct(prisma);
      await createProduct(prisma, { isPublished: false });
      await createProduct(prisma, { archivedAt: new Date(), isPublished: false });
      await search.upsert([
        {
          id: '00000000-0000-4000-8000-000000000000',
          title: 'Ghost',
          description: '',
          categoryId: 'c',
          categoryName: 'c',
          sellerId: 's',
          sellerName: 's',
          type: 'FIXED_PRICE',
          priceCents: 1,
          ratingAvg: 0,
          ratingCount: 0,
          inStock: true,
          stock: 1,
          createdAt: 0,
          imageUrl: null,
          auctionId: null,
          auctionStatus: null,
          auctionEndsAt: null,
          version: 0,
          schemaVersion: CATALOG_SCHEMA_VERSION,
        },
      ]);

      const count = await app.get(SearchIndexer).reindexAll({ clear: true });

      expect(count).toBe(1);
      expect((await indexed()).map((item) => item.id)).toEqual([kept.id]);
    });

    it('rewrites documents stored in an older layout when the worker starts', async () => {
      const product = await createProduct(prisma);
      await search.upsert([
        {
          id: product.id,
          title: 'Stale',
          description: '',
          categoryId: 'c',
          categoryName: 'c',
          sellerId: 's',
          sellerName: 's',
          type: 'FIXED_PRICE',
          priceCents: 1,
          ratingAvg: 0,
          ratingCount: 0,
          inStock: true,
          stock: 1,
          createdAt: 0,
          imageUrl: null,
          auctionId: null,
          auctionStatus: null,
          auctionEndsAt: null,
          version: 0,
          schemaVersion: 1,
        },
      ]);
      expect(await search.countOutdated()).toBe(1);

      await app.get(SearchBootstrap).onApplicationBootstrap();

      expect(await search.countOutdated()).toBe(0);
      expect((await indexed()).map((item) => item.title)).toEqual([product.title]);
    });
  });
});
