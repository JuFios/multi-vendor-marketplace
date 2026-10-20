import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Meilisearch } from 'meilisearch';
import { Meilisearch as MeilisearchClient } from 'meilisearch';
import request from 'supertest';

import { SearchIndexer } from '../../src/modules/search-sync/search-indexer.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MEILI_CLIENT } from '../../src/search/meili.constants';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createCategory, createProduct, createSeller } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { createTestApp } from '../utils/test-app';

const INDEX = 'test_products';

interface CatalogBody {
  items: { id: string; priceCents: number }[];
  degraded: boolean;
}

describe('catalog cache (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let meili: Meilisearch;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    meili = app.get<Meilisearch>(MEILI_CLIENT);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await meili.index(INDEX).deleteAllDocuments().waitTask();
  });

  afterAll(async () => {
    await resetDb(prisma);
    await meili.index(INDEX).deleteAllDocuments().waitTask();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const counter = async (name: string): Promise<number> => {
    const { text } = await http().get('/metrics');
    const line = text.split('\n').find((row) => row.startsWith(`${name}{cache="catalog"}`));
    return line === undefined ? 0 : Number(line.split(' ').at(-1));
  };

  const catalog = async (query = '') =>
    (await http().get(`/api/catalog${query}`).expect(200)).body as CatalogBody;

  const indexedProduct = async (priceCents = 10_000) => {
    const { user, seller } = await createSeller(prisma);
    const category = await createCategory(prisma);
    const product = await createProduct(prisma, {
      sellerId: seller.id,
      categoryId: category.id,
      priceCents,
    });
    await app.get(SearchIndexer).reindexAll({ clear: true });
    const auth = await bearerFor(app, {
      id: user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: seller.id,
    });
    return { product, auth };
  };

  it('answers the same request from the cache the second time', async () => {
    await indexedProduct();
    const hits = await counter('cache_hits_total');
    const misses = await counter('cache_misses_total');

    const first = await catalog('?sort=price_asc');
    const second = await catalog('?sort=price_asc');

    expect(second).toEqual(first);
    expect(await counter('cache_misses_total')).toBe(misses + 1);
    expect(await counter('cache_hits_total')).toBe(hits + 1);
  });

  it('keeps different requests apart', async () => {
    await indexedProduct();
    const misses = await counter('cache_misses_total');

    await catalog('?sort=price_asc');
    await catalog('?sort=price_desc');

    expect(await counter('cache_misses_total')).toBe(misses + 2);
  });

  it('shows the new price once the change has reached the index', async () => {
    const { product, auth } = await indexedProduct(10_000);
    expect((await catalog()).items[0]?.priceCents).toBe(10_000);

    await http()
      .patch(`/api/seller/products/${product.id}`)
      .set('Authorization', auth)
      .send({ priceCents: 6_000 })
      .expect(200);
    await flushEvents();

    expect((await catalog()).items[0]?.priceCents).toBe(6_000);
  });

  it('drops a product from the cached catalog after it is archived', async () => {
    const { product, auth } = await indexedProduct();
    expect((await catalog()).items).toHaveLength(1);

    await http()
      .delete(`/api/seller/products/${product.id}`)
      .set('Authorization', auth)
      .expect(204);
    await flushEvents();

    expect((await catalog()).items).toEqual([]);
  });
});

describe('catalog cache without the search index (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([
      {
        token: MEILI_CLIENT,
        useValue: new MeilisearchClient({
          host: 'http://127.0.0.1:1',
          apiKey: 'unreachable-key-123',
        }),
      },
    ]);
    prisma = app.get(PrismaService);
  });

  beforeEach(() => resetDb(prisma));

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  it('never keeps a degraded answer', async () => {
    // A query no other spec uses, so no healthy answer to it can be sitting in the cache.
    const url = '/api/catalog?q=degraded-cache-check';
    await createProduct(prisma, { title: 'degraded-cache-check item' });
    const http = () => request(app.getHttpServer());
    const hitsOf = async (): Promise<number> => {
      const { text } = await http().get('/metrics');
      const line = text
        .split('\n')
        .find((row) => row.startsWith('cache_hits_total{cache="catalog"}'));
      return line === undefined ? 0 : Number(line.split(' ').at(-1));
    };
    const before = await hitsOf();

    const first = (await http().get(url).expect(200)).body as CatalogBody;
    const second = (await http().get(url).expect(200)).body as CatalogBody;

    expect([first.degraded, second.degraded]).toEqual([true, true]);
    expect(await hitsOf()).toBe(before);
  });
});
