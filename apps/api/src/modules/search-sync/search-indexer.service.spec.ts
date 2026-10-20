import type { SearchPort } from '../../search/search.port';
import type { CategoriesService } from '../categories/categories.service';
import type { Product } from '../products/product';
import type { ProductsService } from '../products/products.service';
import type { SellersService } from '../sellers/sellers.service';

import type { CatalogNamespace } from './catalog-namespace.service';
import { SearchIndexer } from './search-indexer.service';

const product = (version: number, overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  sellerId: 's1',
  categoryId: 'c1',
  type: 'FIXED_PRICE',
  title: `Title v${version}`,
  description: 'd',
  images: [],
  priceCents: 100,
  stock: 1,
  version,
  moderationStatus: 'APPROVED',
  moderationReason: null,
  isPublished: true,
  archivedAt: null,
  ratingAvg: 0,
  ratingCount: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

function setup(reads: Product[][]) {
  const findPublishedByIds = jest.fn();
  for (const read of reads) {
    findPublishedByIds.mockResolvedValueOnce(read);
  }
  const search = {
    upsert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const namespace = { bump: jest.fn().mockResolvedValue(undefined) };
  const indexer = new SearchIndexer(
    search as unknown as SearchPort,
    { findPublishedByIds } as unknown as ProductsService,
    {
      list: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Cat' }]),
    } as unknown as CategoriesService,
    {
      findStoreNames: jest.fn().mockResolvedValue(new Map([['s1', 'Shop']])),
    } as unknown as SellersService,
    namespace as unknown as CatalogNamespace,
  );
  return { indexer, search, namespace, findPublishedByIds };
}

describe('SearchIndexer.syncProducts', () => {
  it('writes once when the product did not change meanwhile', async () => {
    const { indexer, search, namespace } = setup([[product(1)], [product(1)]]);

    await indexer.syncProducts(['p1']);

    expect(search.upsert).toHaveBeenCalledTimes(1);
    expect(namespace.bump).toHaveBeenCalledTimes(1);
  });

  it('writes the newer state again when another event changed the product meanwhile', async () => {
    const { indexer, search, namespace } = setup([
      [product(1)],
      [product(2)],
      [product(2)],
      [product(2)],
    ]);

    await indexer.syncProducts(['p1']);

    expect(search.upsert).toHaveBeenCalledTimes(2);
    expect(search.upsert).toHaveBeenLastCalledWith([
      expect.objectContaining({ title: 'Title v2' }),
    ]);
    expect(namespace.bump).toHaveBeenCalledTimes(1);
  });

  it('gives up, so the queue retries, when the product never settles', async () => {
    const { indexer } = setup([
      [product(1)],
      [product(2)],
      [product(2)],
      [product(3)],
      [product(3)],
      [product(4)],
    ]);

    await expect(indexer.syncProducts(['p1'])).rejects.toThrow('kept changing');
  });

  it('removes a product that stopped being published', async () => {
    const { indexer, search } = setup([[], []]);

    await indexer.syncProducts(['p1']);

    expect(search.remove).toHaveBeenCalledWith(['p1']);
    expect(search.upsert).toHaveBeenCalledWith([]);
  });
});
