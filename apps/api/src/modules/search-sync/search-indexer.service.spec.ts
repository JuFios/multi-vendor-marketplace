import type { SearchPort } from '../../search/search.port';
import type { LotListing } from '../bidding/auction';
import type { AuctionsService } from '../bidding/auctions.service';
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

const lot = (version: number, overrides: Partial<LotListing> = {}): LotListing => ({
  auctionId: 'a1',
  status: 'ACTIVE',
  priceCents: 5_000,
  endsAt: new Date('2026-02-01T00:00:00.000Z'),
  open: true,
  version,
  ...overrides,
});

/** Reads are consumed in order; each product read is paired with the lots read next to it. */
function setup(reads: Product[][], lotReads: [string, LotListing][][] = []) {
  const findPublishedByIds = jest.fn();
  const findListings = jest.fn();
  reads.forEach((read, index) => {
    findPublishedByIds.mockResolvedValueOnce(read);
    findListings.mockResolvedValueOnce(new Map(lotReads[index] ?? []));
  });
  const search = {
    upsert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const namespace = { bump: jest.fn().mockResolvedValue(undefined) };
  const indexer = new SearchIndexer(
    search as unknown as SearchPort,
    { findPublishedByIds } as unknown as ProductsService,
    { findListings } as unknown as AuctionsService,
    {
      list: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Cat' }]),
    } as unknown as CategoriesService,
    {
      findStoreNames: jest.fn().mockResolvedValue(new Map([['s1', 'Shop']])),
    } as unknown as SellersService,
    namespace as unknown as CatalogNamespace,
  );
  return { indexer, search, namespace, findPublishedByIds, findListings };
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

describe('SearchIndexer with auction lots', () => {
  const listed = (version: number, overrides: Partial<Product> = {}): Product =>
    product(version, { type: 'AUCTION', priceCents: null, stock: 1, ...overrides });

  it('indexes a lot at its going bid, with the auction a buyer needs to bid', async () => {
    const { indexer, search } = setup(
      [[listed(1)], [listed(1)]],
      [[['p1', lot(3)]], [['p1', lot(3)]]],
    );

    await indexer.syncProducts(['p1']);

    expect(search.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'AUCTION',
        priceCents: 5_000,
        inStock: true,
        auctionId: 'a1',
        auctionStatus: 'ACTIVE',
        auctionEndsAt: Date.parse('2026-02-01T00:00:00.000Z'),
      }),
    ]);
  });

  it('shows a lot that no longer takes bids as unavailable', async () => {
    const sold = lot(4, { status: 'ORDERED', open: false });
    const { indexer, search } = setup([[listed(1)], [listed(1)]], [[['p1', sold]], [['p1', sold]]]);

    await indexer.syncProducts(['p1']);

    expect(search.upsert).toHaveBeenCalledWith([expect.objectContaining({ inStock: false })]);
  });

  it('writes again when a bid moved the lot while it was writing', async () => {
    const { indexer, search } = setup(
      [[listed(1)], [listed(1)], [listed(1)], [listed(1)]],
      [
        [['p1', lot(3)]],
        [['p1', lot(4, { priceCents: 6_000 })]],
        [['p1', lot(4, { priceCents: 6_000 })]],
        [['p1', lot(4, { priceCents: 6_000 })]],
      ],
    );

    await indexer.syncProducts(['p1']);

    expect(search.upsert).toHaveBeenCalledTimes(2);
    expect(search.upsert).toHaveBeenLastCalledWith([
      expect.objectContaining({ priceCents: 6_000 }),
    ]);
  });
});
