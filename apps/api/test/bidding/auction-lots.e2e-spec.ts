import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { UserRole } from '../../src/modules/users/user-role';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createAuction, createCategory, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface Caller {
  id: string;
  roles?: UserRole[];
  sellerId?: string;
}

interface ProductBody {
  id: string;
  type: string;
  priceCents: number | null;
  stock: number;
  auctionId: string | null;
}

interface AuctionBody {
  id: string;
  productId: string;
  status: string;
  round: number;
  startPriceCents: number;
  bidStepCents: number;
  currentPriceCents: number | null;
  minNextBidCents: number | null;
  bidCount: number;
  leader: string | null;
  endsAt: string;
  serverTime: string;
}

interface BidsBody {
  items: { amountCents: number; bidder: string; isOwn: boolean; round: number }[];
  total: number;
}

interface ErrorBody {
  error: { code: string };
}

const HOUR_MS = 3_600_000;

describe('Auction lots (e2e)', () => {
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

  const callerOf = (s: Awaited<ReturnType<typeof createSeller>>): Caller => ({
    id: s.user.id,
    roles: ['CUSTOMER', 'SELLER'],
    sellerId: s.seller.id,
  });

  const createLot = async (caller: Caller, overrides: object = {}) => {
    const category = await createCategory(prisma);
    return request(app.getHttpServer())
      .post('/api/seller/products')
      .set('Authorization', await bearerFor(app, caller))
      .send({
        type: 'AUCTION',
        categoryId: category.id,
        title: 'Vintage camera',
        description: 'Works well',
        startPriceCents: 10_000,
        bidStepCents: 500,
        endsAt: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
        ...overrides,
      });
  };

  describe('creating a lot', () => {
    it('creates the product and its first round together', async () => {
      const seller = callerOf(await createSeller(prisma));

      const response = await createLot(seller);

      expect(response.status).toBe(201);
      const body = response.body as ProductBody;
      expect(body).toMatchObject({ type: 'AUCTION', priceCents: null, stock: 1 });
      const auction = await prisma.auction.findUniqueOrThrow({
        where: { id: body.auctionId ?? '' },
      });
      expect(auction).toMatchObject({
        productId: body.id,
        sellerId: seller.sellerId,
        status: 'ACTIVE',
        round: 1,
        startPriceCents: 10_000,
        bidStepCents: 500,
        bidCount: 0,
        currentPriceCents: null,
        version: 0,
      });
      expect(auction.durationSec).toBeGreaterThanOrEqual(2 * 3_600 - 5);
      expect(auction.durationSec).toBeLessThanOrEqual(2 * 3_600 + 1);
      const started = await prisma.outboxEvent.findMany({
        where: { eventType: 'auction.started' },
      });
      expect(started).toHaveLength(1);
      expect(started[0]?.payload).toMatchObject({
        auctionId: auction.id,
        productId: body.id,
        round: 1,
      });
    });

    it.each([
      ['in less than a minute', 30_000],
      ['in more than thirty days', 31 * 24 * HOUR_MS],
      ['in the past', -HOUR_MS],
    ])('refuses a lot that ends %s and creates nothing', async (_name, offsetMs) => {
      const seller = callerOf(await createSeller(prisma));

      const response = await createLot(seller, {
        endsAt: new Date(Date.now() + offsetMs).toISOString(),
      });

      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe('AUCTION_ENDS_AT_OUT_OF_RANGE');
      expect(await prisma.product.count()).toBe(0);
      expect(await prisma.auction.count()).toBe(0);
      expect(await prisma.outboxEvent.count({ where: { eventType: 'auction.started' } })).toBe(0);
    });

    it.each([
      ['a float start price', { startPriceCents: 10.5 }],
      ['a zero step', { bidStepCents: 0 }],
      ['an invalid end', { endsAt: 'tomorrow' }],
    ])('rejects %s', async (_name, overrides) => {
      const seller = callerOf(await createSeller(prisma));

      const response = await createLot(seller, overrides);

      expect(response.status).toBe(400);
      expect(await prisma.product.count()).toBe(0);
    });
  });

  describe('GET /auctions/:id', () => {
    it('is public and shows the next minimum bid and the server clock', async () => {
      const store = await createSeller(prisma);
      const auction = await createAuction(prisma, { sellerId: store.seller.id });

      const response = await request(app.getHttpServer()).get(`/api/auctions/${auction.id}`);

      expect(response.status).toBe(200);
      const body = response.body as AuctionBody;
      expect(body).toMatchObject({
        id: auction.id,
        status: 'ACTIVE',
        round: 1,
        startPriceCents: 10_000,
        minNextBidCents: 10_000,
        currentPriceCents: null,
        bidCount: 0,
        leader: null,
      });
      expect(Math.abs(new Date(body.serverTime).getTime() - Date.now())).toBeLessThan(5_000);
    });

    it('asks for the leading bid plus one step once somebody leads', async () => {
      const store = await createSeller(prisma);
      const bidder = await createUser(prisma);
      const auction = await createAuction(prisma, { sellerId: store.seller.id });
      const bid = await prisma.bid.create({
        data: { auctionId: auction.id, round: 1, bidderId: bidder.id, amountCents: 12_000 },
      });
      await prisma.auction.update({
        where: { id: auction.id },
        data: {
          currentPriceCents: 12_000,
          highestBidId: bid.id,
          highestBidderId: bidder.id,
          bidCount: 1,
          version: 1,
        },
      });

      const body = (await request(app.getHttpServer()).get(`/api/auctions/${auction.id}`))
        .body as AuctionBody;

      expect(body.minNextBidCents).toBe(12_500);
      expect(body.leader).toMatch(/^Bidder #[0-9a-f]{4}$/);
      expect(JSON.stringify(body)).not.toContain(bidder.id);
    });

    it('answers 404 for an unknown auction and 400 for a bad id', async () => {
      const unknown = await request(app.getHttpServer()).get(
        '/api/auctions/00000000-0000-4000-8000-000000000000',
      );
      const bad = await request(app.getHttpServer()).get('/api/auctions/nope');

      expect(unknown.status).toBe(404);
      expect((unknown.body as ErrorBody).error.code).toBe('AUCTION_NOT_FOUND');
      expect(bad.status).toBe(400);
    });
  });

  describe('GET /auctions/:id/bids', () => {
    const withBids = async () => {
      const store = await createSeller(prisma);
      const alice = await createUser(prisma);
      const bob = await createUser(prisma);
      const auction = await createAuction(prisma, { sellerId: store.seller.id });
      await prisma.bid.createMany({
        data: [
          { auctionId: auction.id, round: 1, bidderId: alice.id, amountCents: 10_000 },
          { auctionId: auction.id, round: 1, bidderId: bob.id, amountCents: 10_500 },
          { auctionId: auction.id, round: 1, bidderId: alice.id, amountCents: 11_000 },
          { auctionId: auction.id, round: 2, bidderId: bob.id, amountCents: 9_000 },
        ],
      });
      return { auction, alice, bob };
    };

    it('masks every bidder for an anonymous caller, highest bid first', async () => {
      const { auction, alice } = await withBids();

      const response = await request(app.getHttpServer()).get(`/api/auctions/${auction.id}/bids`);

      expect(response.status).toBe(200);
      const body = response.body as BidsBody;
      expect(body.total).toBe(3);
      expect(body.items.map((bid) => bid.amountCents)).toEqual([11_000, 10_500, 10_000]);
      expect(body.items.every((bid) => !bid.isOwn && bid.bidder.startsWith('Bidder #'))).toBe(true);
      expect(body.items[0]?.bidder).toBe(body.items[2]?.bidder);
      expect(JSON.stringify(body)).not.toContain(alice.id);
    });

    it('flags the caller’s own bids', async () => {
      const { auction, alice } = await withBids();

      const response = await request(app.getHttpServer())
        .get(`/api/auctions/${auction.id}/bids`)
        .set('Authorization', await bearerFor(app, { id: alice.id }));

      const own = (response.body as BidsBody).items.filter((bid) => bid.isOwn);
      expect(own.map((bid) => bid.amountCents)).toEqual([11_000, 10_000]);
      expect(own.every((bid) => bid.bidder === 'You')).toBe(true);
    });

    it('keeps the history of earlier rounds available', async () => {
      const { auction } = await withBids();
      await prisma.auction.update({ where: { id: auction.id }, data: { round: 2 } });

      const current = (await request(app.getHttpServer()).get(`/api/auctions/${auction.id}/bids`))
        .body as BidsBody;
      const first = (
        await request(app.getHttpServer()).get(`/api/auctions/${auction.id}/bids?round=1`)
      ).body as BidsBody;

      expect(current.items.map((bid) => bid.amountCents)).toEqual([9_000]);
      expect(first.total).toBe(3);
    });

    it('ignores a bad token instead of failing', async () => {
      const { auction } = await withBids();

      const response = await request(app.getHttpServer())
        .get(`/api/auctions/${auction.id}/bids`)
        .set('Authorization', 'Bearer not-a-token');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /seller/auctions', () => {
    it('lists the store’s own auctions only', async () => {
      const mine = await createSeller(prisma);
      const other = await createSeller(prisma);
      const own = await createAuction(prisma, { sellerId: mine.seller.id });
      await createAuction(prisma, { sellerId: other.seller.id });

      const response = await request(app.getHttpServer())
        .get('/api/seller/auctions')
        .set('Authorization', await bearerFor(app, callerOf(mine)));

      expect(response.status).toBe(200);
      const body = response.body as { items: AuctionBody[]; total: number };
      expect(body.total).toBe(1);
      expect(body.items[0]).toMatchObject({ id: own.id, bidCount: 0 });
    });

    it('is for sellers only', async () => {
      const buyer = await createUser(prisma);

      const response = await request(app.getHttpServer())
        .get('/api/seller/auctions')
        .set('Authorization', await bearerFor(app, { id: buyer.id }));

      expect(response.status).toBe(403);
    });
  });
});
