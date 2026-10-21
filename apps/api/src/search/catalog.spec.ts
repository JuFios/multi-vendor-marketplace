import {
  CATALOG_SCHEMA_VERSION,
  buildMeiliFilter,
  buildMeiliSort,
  type CatalogQuery,
  type IndexableProduct,
  toCatalogDocument,
} from './catalog';

const base: CatalogQuery = { sort: 'relevance', page: 1, limit: 20 };

describe('buildMeiliFilter', () => {
  it('has no clauses without filters', () => {
    expect(buildMeiliFilter(base)).toEqual([]);
  });

  it('turns each filter into a clause', () => {
    const filter = buildMeiliFilter({
      ...base,
      categoryId: 'c1',
      sellerId: 's1',
      type: 'FIXED_PRICE',
      priceMin: 1000,
      priceMax: 5000,
      ratingMin: 4,
      inStock: true,
    });

    expect(filter).toEqual([
      'categoryId = "c1"',
      'sellerId = "s1"',
      'type = "FIXED_PRICE"',
      'priceCents >= 1000',
      'priceCents <= 5000',
      'ratingAvg >= 4',
      'inStock = true',
    ]);
  });

  it('keeps false filters', () => {
    expect(buildMeiliFilter({ ...base, inStock: false })).toEqual(['inStock = false']);
  });

  it('cannot be extended by a value that carries filter syntax', () => {
    const [clause] = buildMeiliFilter({ ...base, categoryId: 'x" OR sellerId != "' });

    expect(clause).toBe('categoryId = "x\\" OR sellerId != \\""');
  });

  it('escapes backslashes so they cannot swallow the closing quote', () => {
    const [clause] = buildMeiliFilter({ ...base, sellerId: 'a\\' });

    expect(clause).toBe('sellerId = "a\\\\"');
  });

  it('refuses a number that is not finite', () => {
    expect(() => buildMeiliFilter({ ...base, priceMin: Number.NaN })).toThrow(RangeError);
  });
});

describe('buildMeiliSort', () => {
  it.each([
    ['relevance', []],
    ['price_asc', ['priceCents:asc']],
    ['price_desc', ['priceCents:desc']],
    ['rating_desc', ['ratingAvg:desc']],
    ['newest', ['createdAt:desc']],
  ] as const)('%s', (sort, expected) => {
    expect(buildMeiliSort(sort)).toEqual(expected);
  });
});

describe('toCatalogDocument', () => {
  const product: IndexableProduct = {
    id: 'p1',
    title: 'Phone',
    description: 'A phone',
    categoryId: 'c1',
    categoryName: 'Phones',
    sellerId: 's1',
    sellerName: 'Shop',
    type: 'FIXED_PRICE',
    priceCents: 25_000,
    ratingAvg: 4.5,
    ratingCount: 2,
    inStock: true,
    stock: 3,
    images: ['https://img.example/1.png', 'https://img.example/2.png'],
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    version: 7,
    auction: null,
  };

  it('copies the searchable fields and derives the rest', () => {
    expect(toCatalogDocument(product)).toEqual({
      id: 'p1',
      title: 'Phone',
      description: 'A phone',
      categoryId: 'c1',
      categoryName: 'Phones',
      sellerId: 's1',
      sellerName: 'Shop',
      type: 'FIXED_PRICE',
      priceCents: 25_000,
      ratingAvg: 4.5,
      ratingCount: 2,
      inStock: true,
      stock: 3,
      createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
      imageUrl: 'https://img.example/1.png',
      version: 7,
      schemaVersion: CATALOG_SCHEMA_VERSION,
      auctionId: null,
      auctionStatus: null,
      auctionEndsAt: null,
    });
  });

  it('keeps a product that can no longer be bought and that has no image', () => {
    expect(toCatalogDocument({ ...product, inStock: false, images: [] })).toMatchObject({
      inStock: false,
      imageUrl: null,
    });
  });

  it('carries the lot of an auction product', () => {
    const lot = {
      id: 'a1',
      status: 'ACTIVE',
      endsAt: new Date('2026-02-01T00:00:00.000Z'),
    } as const;

    expect(
      toCatalogDocument({
        ...product,
        type: 'AUCTION',
        priceCents: 5_000,
        inStock: true,
        auction: lot,
      }),
    ).toMatchObject({
      type: 'AUCTION',
      priceCents: 5_000,
      inStock: true,
      auctionId: 'a1',
      auctionStatus: 'ACTIVE',
      auctionEndsAt: Date.parse('2026-02-01T00:00:00.000Z'),
    });
  });
});
