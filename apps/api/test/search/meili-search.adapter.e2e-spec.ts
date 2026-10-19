import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Meilisearch } from 'meilisearch';

import {
  MEILI_CLIENT,
  SEARCH_PORT,
  type CatalogDocument,
  type CatalogQuery,
  type SearchPort,
} from '../../src/search';
import { createTestApp } from '../utils/test-app';

const INDEX = 'test_products';
const query = (overrides: Partial<CatalogQuery> = {}): CatalogQuery => ({
  sort: 'relevance',
  page: 1,
  limit: 20,
  ...overrides,
});

const document = (id: string, overrides: Partial<CatalogDocument> = {}): CatalogDocument => ({
  id,
  title: `Product ${id}`,
  description: 'Plain description',
  categoryId: 'cat-a',
  categoryName: 'Category A',
  sellerId: 'seller-a',
  sellerName: 'Seller A',
  type: 'FIXED_PRICE',
  priceCents: 10_000,
  ratingAvg: 0,
  ratingCount: 0,
  inStock: true,
  stock: 5,
  createdAt: 1_000,
  imageUrl: null,
  version: 0,
  ...overrides,
});

describe('MeiliSearchAdapter (e2e)', () => {
  let app: NestExpressApplication;
  let search: SearchPort;
  let meili: Meilisearch;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    search = app.get<SearchPort>(SEARCH_PORT);
    meili = app.get<Meilisearch>(MEILI_CLIENT);
    await search.ensureIndex();
  });

  beforeEach(async () => {
    await meili.index(INDEX).deleteAllDocuments().waitTask();
  });

  afterAll(async () => {
    await meili.index(INDEX).deleteAllDocuments().waitTask();
    await app.close();
  });

  it('can be set up repeatedly', async () => {
    await expect(search.ensureIndex()).resolves.toBeUndefined();
    await expect(search.countDocuments()).resolves.toBe(0);
  });

  it('lifts the default limits on reachable hits and facet values', async () => {
    const settings = await meili.index(INDEX).getSettings();

    expect(settings.pagination?.maxTotalHits).toBe(10_000);
    expect(settings.faceting?.maxValuesPerFacet).toBe(1_000);
  });

  it('finds a document by text, tolerating a typo', async () => {
    await search.upsert([
      document('1', { title: 'Wireless headphones' }),
      document('2', { title: 'Kitchen scale' }),
    ]);

    const result = await search.search(query({ q: 'headphnes' }));

    expect(result.items.map((item) => item.id)).toEqual(['1']);
    expect(result.total).toBe(1);
  });

  it('keeps one document per id when it is upserted again', async () => {
    await search.upsert([document('1', { priceCents: 100 })]);
    await search.upsert([document('1', { priceCents: 200 })]);

    const result = await search.search(query());

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.priceCents).toBe(200);
  });

  it('removes documents', async () => {
    await search.upsert([document('1'), document('2')]);

    await search.remove(['1']);

    expect((await search.search(query())).items.map((item) => item.id)).toEqual(['2']);
  });

  it('filters by category, seller, type, price, rating and stock', async () => {
    await search.upsert([
      document('1', { categoryId: 'c1', priceCents: 1_000, ratingAvg: 4.5, ratingCount: 3 }),
      document('2', { categoryId: 'c2', sellerId: 's2', priceCents: 5_000, type: 'AUCTION' }),
      document('3', { categoryId: 'c1', priceCents: 9_000, inStock: false, stock: 0 }),
    ]);
    const ids = async (overrides: Partial<CatalogQuery>) =>
      (await search.search(query({ sort: 'price_asc', ...overrides }))).items.map(
        (item) => item.id,
      );

    expect(await ids({ categoryId: 'c1' })).toEqual(['1', '3']);
    expect(await ids({ sellerId: 's2' })).toEqual(['2']);
    expect(await ids({ type: 'AUCTION' })).toEqual(['2']);
    expect(await ids({ priceMin: 2_000, priceMax: 6_000 })).toEqual(['2']);
    expect(await ids({ ratingMin: 4 })).toEqual(['1']);
    expect(await ids({ inStock: true })).toEqual(['1', '2']);
    expect(await ids({ categoryId: 'c1', inStock: false })).toEqual(['3']);
  });

  it('sorts by price, rating and age', async () => {
    await search.upsert([
      document('1', { priceCents: 300, ratingAvg: 2, createdAt: 10 }),
      document('2', { priceCents: 100, ratingAvg: 5, createdAt: 30 }),
      document('3', { priceCents: 200, ratingAvg: 3, createdAt: 20 }),
    ]);
    const order = async (sort: CatalogQuery['sort']) =>
      (await search.search(query({ sort }))).items.map((item) => item.id);

    expect(await order('price_asc')).toEqual(['2', '3', '1']);
    expect(await order('price_desc')).toEqual(['1', '3', '2']);
    expect(await order('rating_desc')).toEqual(['2', '3', '1']);
    expect(await order('newest')).toEqual(['2', '3', '1']);
  });

  it('reports facet counts and the price range of all matches', async () => {
    await search.upsert([
      document('1', { categoryId: 'c1', sellerId: 's1', priceCents: 1_000 }),
      document('2', { categoryId: 'c1', sellerId: 's2', priceCents: 4_000 }),
      document('3', {
        categoryId: 'c2',
        sellerId: 's2',
        priceCents: 9_000,
        inStock: false,
        stock: 0,
      }),
    ]);

    const result = await search.search(query({ limit: 1 }));

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.facets.categoryId).toEqual(
      expect.arrayContaining([
        { value: 'c1', count: 2 },
        { value: 'c2', count: 1 },
      ]),
    );
    expect(result.facets.sellerId).toEqual(
      expect.arrayContaining([
        { value: 's1', count: 1 },
        { value: 's2', count: 2 },
      ]),
    );
    expect(result.facets.inStock).toEqual(
      expect.arrayContaining([
        { value: 'true', count: 2 },
        { value: 'false', count: 1 },
      ]),
    );
    expect(result.priceRange).toEqual({ min: 1_000, max: 9_000 });
  });

  it('pages through the results', async () => {
    await search.upsert(
      ['1', '2', '3'].map((id, index) => document(id, { priceCents: (index + 1) * 100 })),
    );

    const second = await search.search(query({ sort: 'price_asc', page: 2, limit: 2 }));

    expect(second.items.map((item) => item.id)).toEqual(['3']);
    expect(second).toMatchObject({ total: 3, page: 2, limit: 2 });
  });

  it('treats filter syntax in a value as plain text', async () => {
    await search.upsert([document('1')]);

    const result = await search.search(query({ categoryId: 'x" OR sellerId = "seller-a' }));

    expect(result.items).toEqual([]);
  });
});
