import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { UserRole } from '../../src/modules/users/user-role';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createAuction, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface Caller {
  id: string;
  roles?: UserRole[];
  sellerId?: string;
}

interface PlacedBody {
  bid: { id: string; amountCents: number; isOwn: boolean; bidder: string };
  auction: {
    currentPriceCents: number;
    minNextBidCents: number;
    bidCount: number;
    version: number;
  };
}

interface ErrorBody {
  error: { code: string; details?: { minNextBidCents: number | null } };
}

describe('Bids (e2e)', () => {
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

  const bid = async (
    auctionId: string,
    caller: Caller,
    amountCents: number,
    key: string = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post(`/api/auctions/${auctionId}/bids`)
      .set('Authorization', await bearerFor(app, caller))
      .set('Idempotency-Key', key)
      .send({ amountCents });

  /** A lot starting at 100.00 with a step of 5.00, ending in an hour. */
  const lot = async () => {
    const store = await createSeller(prisma);
    const auction = await createAuction(prisma, { sellerId: store.seller.id });
    const buyer = await createUser(prisma);
    return {
      auction,
      buyer: { id: buyer.id } as Caller,
      seller: {
        id: store.user.id,
        roles: ['CUSTOMER', 'SELLER'],
        sellerId: store.seller.id,
      } as Caller,
    };
  };

  it('accepts a first bid equal to the start price and updates the auction', async () => {
    const { auction, buyer } = await lot();

    const response = await bid(auction.id, buyer, 10_000);

    expect(response.status).toBe(201);
    const body = response.body as PlacedBody;
    expect(body.bid).toMatchObject({ amountCents: 10_000, isOwn: true, bidder: 'You' });
    expect(body.auction).toMatchObject({
      currentPriceCents: 10_000,
      minNextBidCents: 10_500,
      bidCount: 1,
      version: 1,
    });
    const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(stored).toMatchObject({
      currentPriceCents: 10_000,
      highestBidId: body.bid.id,
      highestBidderId: buyer.id,
      bidCount: 1,
      version: 1,
    });
    const events = await prisma.outboxEvent.findMany({
      where: { eventType: 'auction.bid_placed' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      auctionId: auction.id,
      productId: auction.productId,
      round: 1,
      currentPriceCents: 10_000,
      bidCount: 1,
      version: 1,
    });
  });

  it('accepts exactly the leading bid plus one step and refuses anything lower', async () => {
    const { auction, buyer } = await lot();
    const rival = await createUser(prisma);
    await bid(auction.id, buyer, 12_000);

    const tooLow = await bid(auction.id, { id: rival.id }, 12_499);
    const exact = await bid(auction.id, { id: rival.id }, 12_500);

    expect(tooLow.status).toBe(422);
    expect((tooLow.body as ErrorBody).error).toMatchObject({
      code: 'BID_TOO_LOW',
      details: { minNextBidCents: 12_500 },
    });
    expect(exact.status).toBe(201);
    expect(await prisma.bid.count({ where: { auctionId: auction.id } })).toBe(2);
  });

  it('refuses a first bid below the start price', async () => {
    const { auction, buyer } = await lot();

    const response = await bid(auction.id, buyer, 9_999);

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).error.code).toBe('BID_TOO_LOW');
    expect(await prisma.bid.count()).toBe(0);
  });

  it('refuses a bid after the deadline', async () => {
    const { auction, buyer } = await lot();
    await prisma.auction.update({
      where: { id: auction.id },
      data: { endsAt: new Date(Date.now() - 1_000) },
    });

    const response = await bid(auction.id, buyer, 10_000);

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).error.code).toBe('AUCTION_ENDED');
    expect(await prisma.bid.count()).toBe(0);
  });

  it.each(['SOLD_TO_WINNER', 'ORDERED', 'NOT_SOLD'] as const)(
    'refuses a bid on an auction that is %s',
    async (status) => {
      const { auction, buyer } = await lot();
      await prisma.auction.update({ where: { id: auction.id }, data: { status } });

      const response = await bid(auction.id, buyer, 10_000);

      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe('AUCTION_NOT_ACTIVE');
    },
  );

  it('refuses the seller’s bid on their own lot with 422', async () => {
    const { auction, seller } = await lot();

    const response = await bid(auction.id, seller, 10_000);

    expect(response.status).toBe(422);
    expect((response.body as ErrorBody).error.code).toBe('SELF_BID_FORBIDDEN');
    expect(await prisma.bid.count()).toBe(0);
  });

  it('answers 404 for an unknown auction and 401 without a token', async () => {
    const { buyer } = await lot();

    const unknown = await bid('00000000-0000-4000-8000-000000000000', buyer, 10_000);
    const anonymous = await request(app.getHttpServer())
      .post('/api/auctions/00000000-0000-4000-8000-000000000000/bids')
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents: 10_000 });

    expect(unknown.status).toBe(404);
    expect(anonymous.status).toBe(401);
  });

  it('validates the amount and requires an Idempotency-Key', async () => {
    const { auction, buyer } = await lot();

    const float = await bid(auction.id, buyer, 100.5);
    const zero = await bid(auction.id, buyer, 0);
    const keyless = await request(app.getHttpServer())
      .post(`/api/auctions/${auction.id}/bids`)
      .set('Authorization', await bearerFor(app, buyer))
      .send({ amountCents: 10_000 });

    expect([float.status, zero.status, keyless.status]).toEqual([400, 400, 400]);
    expect(await prisma.bid.count()).toBe(0);
  });

  it('places the bid once when the same key is sent again', async () => {
    const { auction, buyer } = await lot();
    const key = randomUUID();

    const first = await bid(auction.id, buyer, 10_000, key);
    const replay = await bid(auction.id, buyer, 10_000, key);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(await prisma.bid.count()).toBe(1);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).bidCount).toBe(
      1,
    );
  });

  it('frees the key after a refused bid, so the buyer can retry with a better amount', async () => {
    const { auction, buyer } = await lot();
    const key = randomUUID();

    const refused = await bid(auction.id, buyer, 5_000, key);
    const retried = await bid(auction.id, buyer, 10_000, key);

    expect(refused.status).toBe(422);
    expect(retried.status).toBe(201);
  });

  describe('many bidders at once', () => {
    const BIDDERS = 50;

    it('keeps the auction consistent when 50 users bid in parallel', async () => {
      const { auction } = await lot();
      const bidders = await Promise.all(Array.from({ length: BIDDERS }, () => createUser(prisma)));
      // Ten of them bid exactly the start price; the rest bid distinct, higher amounts.
      const amounts = bidders.map((_, index) => (index < 10 ? 10_000 : 10_000 + (index - 9) * 500));

      const responses = await Promise.all(
        bidders.map((user, index) => bid(auction.id, { id: user.id }, amounts[index] ?? 0)),
      );

      const statuses = responses.map((response) => response.status);
      expect(statuses.every((status) => [201, 409, 422].includes(status))).toBe(true);
      const accepted = statuses.filter((status) => status === 201).length;
      expect(accepted).toBeGreaterThan(0);

      const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      const bids = await prisma.bid.findMany({
        where: { auctionId: auction.id },
        orderBy: [{ createdAt: 'asc' }, { amountCents: 'asc' }],
      });
      expect(bids).toHaveLength(accepted);
      expect(stored.bidCount).toBe(accepted);
      expect(stored.version).toBe(accepted);

      const amountsInOrder = bids.map((entry) => entry.amountCents);
      expect(new Set(amountsInOrder).size).toBe(amountsInOrder.length);
      expect(amountsInOrder[0]).toBeGreaterThanOrEqual(10_000);
      for (let index = 1; index < amountsInOrder.length; index += 1) {
        expect(
          (amountsInOrder[index] ?? 0) - (amountsInOrder[index - 1] ?? 0),
        ).toBeGreaterThanOrEqual(500);
      }
      const top = bids.reduce((best, entry) =>
        entry.amountCents > best.amountCents ? entry : best,
      );
      expect(stored.currentPriceCents).toBe(top.amountCents);
      expect(stored.highestBidId).toBe(top.id);
      expect(stored.highestBidderId).toBe(top.bidderId);
      expect(await prisma.outboxEvent.count({ where: { eventType: 'auction.bid_placed' } })).toBe(
        accepted,
      );
    }, 60_000);
  });
});
