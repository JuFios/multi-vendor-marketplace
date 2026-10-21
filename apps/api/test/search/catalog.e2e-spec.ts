import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Meilisearch } from 'meilisearch';
import { Meilisearch as MeilisearchClient } from 'meilisearch';
import request from 'supertest';

import { Prisma } from '../../src/generated/prisma/client';
import { SearchIndexer } from '../../src/modules/search-sync/search-indexer.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MEILI_CLIENT } from '../../src/search/meili.constants';
import { resetDb } from '../utils/db';
import { createAuction, createCategory, createProduct, createSeller } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

const INDEX = 'test_products';

interface ItemBody {
  id: string;
  title: string;
  priceCents: number | null;
  inStock: boolean;
  auctionId: string | null;
  auctionStatus: string | null;
  auctionEndsAt: string | null;
  rating: { average: number; count: number };
  seller: { id: string; name: string };
  category: { id: string; name: string };
}

interface CatalogBody {
  items: ItemBody[];
  total: number;
  page: number;
  limit: number;
  facets: {
    categories: { id: string; name: string; count: number }[];
    sellers: { id: string; name: string; count: number }[];
    types: { value: string; count: number }[];
    inStock: { value: boolean; count: number }[];
  };
  priceRange: { min: number; max: number } | null;
  degraded: boolean;
}

describe('GET /api/catalog (e2e)', () => {
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
  const reindex = () => app.get(SearchIndexer).reindexAll({ clear: true });
  const get = async (url: string) =>
    (await http().get(`/api/catalog${url}`).expect(200)).body as CatalogBody;
  const ids = (body: CatalogBody) => body.items.map((item) => item.id);

  /** Two stores, two categories, six products with distinct prices, ratings and stock. */
  const seedCatalog = async () => {
    const a = await createSeller(prisma, { storeName: 'Alpha Store' });
    const b = await createSeller(prisma, { storeName: 'Beta Store' });
    const phones = await createCategory(prisma, { name: 'Phones' });
    const kitchen = await createCategory(prisma, { name: 'Kitchen' });
    const phone = await createProduct(prisma, {
      sellerId: a.seller.id,
      categoryId: phones.id,
      title: 'Smartphone Nova',
      priceCents: 30_000,
      ratingAvg: new Prisma.Decimal('4.5'),
      ratingCount: 4,
      stock: 3,
    });
    const cheapPhone = await createProduct(prisma, {
      sellerId: b.seller.id,
      categoryId: phones.id,
      title: 'Basic phone',
      priceCents: 5_000,
      stock: 0,
    });
    const blender = await createProduct(prisma, {
      sellerId: a.seller.id,
      categoryId: kitchen.id,
      title: 'Power blender',
      priceCents: 12_000,
      ratingAvg: new Prisma.Decimal('3'),
      ratingCount: 2,
    });
    const kettle = await createProduct(prisma, {
      sellerId: b.seller.id,
      categoryId: kitchen.id,
      title: 'Electric kettle',
      priceCents: 2_500,
    });
    // Never shown: unpublished, archived.
    await createProduct(prisma, {
      sellerId: a.seller.id,
      categoryId: phones.id,
      isPublished: false,
    });
    await createProduct(prisma, {
      sellerId: a.seller.id,
      categoryId: phones.id,
      archivedAt: new Date(),
      isPublished: false,
    });
    await reindex();
    return { a, b, phones, kitchen, phone, cheapPhone, blender, kettle };
  };

  interface LotOptions {
    sellerId: string;
    categoryId: string;
    startPriceCents?: number;
    currentPriceCents?: number;
    status?: 'ACTIVE' | 'SOLD_TO_WINNER' | 'ORDERED' | 'NOT_SOLD';
    endsAt?: Date;
  }

  /** A published auction product with its auction row, before or after a bid. */
  const seedLot = async (options: LotOptions) => {
    const product = await createProduct(prisma, {
      sellerId: options.sellerId,
      categoryId: options.categoryId,
      type: 'AUCTION',
      priceCents: null,
      stock: 1,
    });
    const auction = await createAuction(prisma, {
      productId: product.id,
      startPriceCents: options.startPriceCents ?? 10_000,
      ...(options.currentPriceCents === undefined
        ? {}
        : { currentPriceCents: options.currentPriceCents }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.endsAt === undefined ? {} : { endsAt: options.endsAt }),
    });
    return { product, auction };
  };

  it('lists only published products, with names, rating and stock state', async () => {
    const { phone } = await seedCatalog();

    const response = await http().get('/api/catalog?sort=price_desc').expect(200);
    const body = response.body as CatalogBody;

    expect(response.headers['x-search-degraded']).toBeUndefined();
    expect(body.total).toBe(4);
    expect(body.degraded).toBe(false);
    expect(body.items[0]).toEqual({
      id: phone.id,
      type: 'FIXED_PRICE',
      title: 'Smartphone Nova',
      imageUrl: null,
      priceCents: 30_000,
      inStock: true,
      stock: 3,
      auctionId: null,
      auctionStatus: null,
      auctionEndsAt: null,
      rating: { average: 4.5, count: 4 },
      seller: { id: phone.sellerId, name: 'Alpha Store' },
      category: { id: phone.categoryId, name: 'Phones' },
    });
  });

  it('searches by text and tolerates a typo', async () => {
    const { phone } = await seedCatalog();

    expect(ids(await get('?q=smartphne'))).toEqual([phone.id]);
  });

  it('filters by category, seller, price, rating and stock', async () => {
    const { a, phones, phone, blender, cheapPhone, kettle } = await seedCatalog();

    expect(ids(await get(`?categoryId=${phones.id}&sort=price_asc`))).toEqual([
      cheapPhone.id,
      phone.id,
    ]);
    expect(ids(await get(`?sellerId=${a.seller.id}&sort=price_asc`))).toEqual([
      blender.id,
      phone.id,
    ]);
    expect(ids(await get('?priceMin=3000&priceMax=13000&sort=price_asc'))).toEqual([
      cheapPhone.id,
      blender.id,
    ]);
    expect(ids(await get('?ratingMin=4'))).toEqual([phone.id]);
    expect(ids(await get('?inStock=false'))).toEqual([cheapPhone.id]);
    expect((await get('?inStock=true')).total).toBe(3);
    expect(ids(await get(`?priceMax=3000`))).toEqual([kettle.id]);
    expect((await get('?type=AUCTION')).total).toBe(0);
  });

  it('sorts by price, rating and newest', async () => {
    const { phone, blender, kettle, cheapPhone } = await seedCatalog();

    expect(ids(await get('?sort=price_asc'))).toEqual([
      kettle.id,
      cheapPhone.id,
      blender.id,
      phone.id,
    ]);
    expect(ids(await get('?sort=rating_desc')).slice(0, 2)).toEqual([phone.id, blender.id]);
    expect(ids(await get('?sort=newest'))).toEqual([
      kettle.id,
      blender.id,
      cheapPhone.id,
      phone.id,
    ]);
  });

  describe('auction lots', () => {
    it('prices a lot at its start price, then at the leading bid, and finds it by price', async () => {
      const store = await createSeller(prisma, { storeName: 'Auction House' });
      const category = await createCategory(prisma, { name: 'Collectibles' });
      const quiet = await seedLot({ sellerId: store.seller.id, categoryId: category.id });
      const live = await seedLot({
        sellerId: store.seller.id,
        categoryId: category.id,
        startPriceCents: 7_000,
      });
      await reindex();

      const before = await get(`?categoryId=${category.id}&sort=price_asc`);

      expect(before.items.map(({ id, priceCents }) => [id, priceCents])).toEqual([
        [live.product.id, 7_000],
        [quiet.product.id, 10_000],
      ]);
      expect(before.items[0]).toMatchObject({
        type: 'AUCTION',
        inStock: true,
        auctionId: live.auction.id,
        auctionStatus: 'ACTIVE',
        auctionEndsAt: live.auction.endsAt.toISOString(),
      });
      expect(before.priceRange).toEqual({ min: 7_000, max: 10_000 });

      await prisma.auction.update({
        where: { id: live.auction.id },
        data: { currentPriceCents: 8_000, bidCount: 1, version: 1 },
      });
      await reindex();

      const raised = await get('?priceMin=7500&priceMax=9000&sort=price_asc');
      expect(raised.items.map((item) => item.id)).toEqual([live.product.id]);
      expect(raised.items[0]?.priceCents).toBe(8_000);
      expect((await get('?priceMax=7500')).items).toEqual([]);
    });

    it('shows a lot that no longer takes bids as unavailable, whatever its status says', async () => {
      const store = await createSeller(prisma);
      const category = await createCategory(prisma);
      const lot = (overrides: Partial<LotOptions> = {}) =>
        seedLot({ sellerId: store.seller.id, categoryId: category.id, ...overrides });
      const active = await lot();
      const sold = await lot({ status: 'SOLD_TO_WINNER' });
      const ordered = await lot({ status: 'ORDERED' });
      const notSold = await lot({ status: 'NOT_SOLD' });
      const expired = await lot({ endsAt: new Date(Date.now() - 60_000) });
      await reindex();

      const open = await get('?type=AUCTION&inStock=true');
      expect(open.items.map((item) => item.id)).toEqual([active.product.id]);

      const closed = await get('?type=AUCTION&inStock=false');
      expect(closed.total).toBe(4);
      expect(closed.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: sold.product.id, auctionStatus: 'SOLD_TO_WINNER' }),
          expect.objectContaining({ id: ordered.product.id, auctionStatus: 'ORDERED' }),
          expect.objectContaining({ id: notSold.product.id, auctionStatus: 'NOT_SOLD' }),
          expect.objectContaining({ id: expired.product.id, auctionStatus: 'ACTIVE' }),
        ]),
      );
      expect(closed.facets.inStock).toEqual(expect.arrayContaining([{ value: false, count: 4 }]));
    });
  });

  it('counts facets with names, and reports the price range of all matches', async () => {
    const { a, b, phones, kitchen } = await seedCatalog();

    const body = await get('?limit=1');

    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(4);
    expect(body.facets.categories).toEqual(
      expect.arrayContaining([
        { id: phones.id, name: 'Phones', count: 2 },
        { id: kitchen.id, name: 'Kitchen', count: 2 },
      ]),
    );
    expect(body.facets.sellers).toEqual(
      expect.arrayContaining([
        { id: a.seller.id, name: 'Alpha Store', count: 2 },
        { id: b.seller.id, name: 'Beta Store', count: 2 },
      ]),
    );
    expect(body.facets.types).toEqual([{ value: 'FIXED_PRICE', count: 4 }]);
    expect(body.facets.inStock).toEqual(
      expect.arrayContaining([
        { value: true, count: 3 },
        { value: false, count: 1 },
      ]),
    );
    expect(body.priceRange).toEqual({ min: 2_500, max: 30_000 });
  });

  it('pages through the results', async () => {
    await seedCatalog();

    const second = await get('?sort=price_asc&page=2&limit=3');

    expect(second).toMatchObject({ total: 4, page: 2, limit: 3 });
    expect(second.items).toHaveLength(1);
  });

  it.each([
    ['a malformed category id', '?categoryId=nope'],
    ['a limit above 50', '?limit=51'],
    ['page zero', '?page=0'],
    ['an unknown sort', '?sort=cheapest'],
    ['a negative price', '?priceMin=-1'],
    ['a fractional price', '?priceMin=1.5'],
    ['a rating above 5', '?ratingMin=6'],
    ['a non-boolean stock flag', '?inStock=maybe'],
    ['an unknown type', '?type=RAFFLE'],
    ['an unknown parameter', '?foo=bar'],
  ])('rejects %s', async (_name, query) => {
    await http().get(`/api/catalog${query}`).expect(400);
  });

  it('treats quotes and filter syntax in the text as plain text', async () => {
    await seedCatalog();

    const body = await get(`?q=${encodeURIComponent('x" OR sellerId != "')}`);

    expect(body.items).toEqual([]);
  });

  it('needs no authentication', async () => {
    await http().get('/api/catalog').expect(200);
  });
});

describe('GET /api/catalog without the search index (e2e)', () => {
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

  const http = () => request(app.getHttpServer());

  it('answers from the database, flagged as degraded, with the same filters', async () => {
    const { seller } = await createSeller(prisma, { storeName: 'Fallback Shop' });
    const phones = await createCategory(prisma, { name: 'Phones' });
    const kitchen = await createCategory(prisma, { name: 'Kitchen' });
    const phone = await createProduct(prisma, {
      sellerId: seller.id,
      categoryId: phones.id,
      title: 'Smartphone Nova',
      priceCents: 30_000,
    });
    await createProduct(prisma, {
      sellerId: seller.id,
      categoryId: kitchen.id,
      title: 'Kettle',
      priceCents: 2_000,
    });
    await createProduct(prisma, { sellerId: seller.id, categoryId: phones.id, isPublished: false });

    const response = await http()
      .get(`/api/catalog?q=PHONE&categoryId=${phones.id}&priceMin=1000&sort=price_asc`)
      .expect(200);

    const body = response.body as CatalogBody;
    expect(response.headers['x-search-degraded']).toBe('1');
    expect(body.degraded).toBe(true);
    expect(body.items.map((item) => item.id)).toEqual([phone.id]);
    expect(body.items[0]).toMatchObject({
      seller: { name: 'Fallback Shop' },
      category: { name: 'Phones' },
    });
    expect(body.total).toBe(1);
    expect(body.facets.categories).toEqual([{ id: phones.id, name: 'Phones', count: 1 }]);
    expect(body.facets.sellers).toEqual([]);
    expect(body.priceRange).toEqual({ min: 30_000, max: 30_000 });
    const metrics = (await http().get('/metrics')).text;
    expect(metrics).toMatch(/search_degraded_total [1-9]/);
  });

  it('prices a lot at its going bid and honours its availability in the fallback', async () => {
    const { seller } = await createSeller(prisma);
    const category = await createCategory(prisma);
    const product = await createProduct(prisma, {
      sellerId: seller.id,
      categoryId: category.id,
      type: 'AUCTION',
      priceCents: null,
      stock: 1,
      title: 'Vintage camera',
    });
    const auction = await createAuction(prisma, {
      productId: product.id,
      startPriceCents: 10_000,
      currentPriceCents: 12_000,
    });

    const body = (await http().get('/api/catalog?sort=price_asc').expect(200)).body as CatalogBody;

    expect(body.items[0]).toMatchObject({
      id: product.id,
      priceCents: 12_000,
      inStock: true,
      auctionId: auction.id,
      auctionStatus: 'ACTIVE',
      auctionEndsAt: auction.endsAt.toISOString(),
    });
    expect(body.priceRange).toEqual({ min: 12_000, max: 12_000 });

    await prisma.auction.update({ where: { id: auction.id }, data: { status: 'ORDERED' } });

    const closed = (await http().get('/api/catalog?inStock=true').expect(200)).body as CatalogBody;
    expect(closed.items).toEqual([]);
    expect(closed.total).toBe(0);
  });

  it('treats LIKE wildcards in the text literally', async () => {
    const { seller } = await createSeller(prisma);
    const category = await createCategory(prisma);
    await createProduct(prisma, {
      sellerId: seller.id,
      categoryId: category.id,
      title: 'Sale 50% off',
    });
    await createProduct(prisma, {
      sellerId: seller.id,
      categoryId: category.id,
      title: 'Regular item',
    });

    const body = (await http().get('/api/catalog?q=%25').expect(200)).body as CatalogBody;

    expect(body.items.map((item) => item.title)).toEqual(['Sale 50% off']);
  });
});
