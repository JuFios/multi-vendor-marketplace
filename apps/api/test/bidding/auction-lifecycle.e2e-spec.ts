import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import request from 'supertest';

import { AuctionLifecycleService } from '../../src/modules/bidding/auction-lifecycle.service';
import { AUCTION_JOB } from '../../src/modules/bidding/bidding.constants';
import type { UserRole } from '../../src/modules/users/user-role';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import { OutboxService } from '../../src/outbox/outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { AppTransactionHost } from '../../src/prisma/transaction';
import { QUEUE } from '../../src/queue/queue-names';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import { createAuction, createSeller, createUser } from '../utils/factories';
import { flushEvents, queueOf } from '../utils/flush-events';
import { createTestApp } from '../utils/test-app';
import { waitUntil } from '../utils/wait-until';

interface Caller {
  id: string;
  roles?: UserRole[];
  sellerId?: string;
}

interface NotificationBody {
  type: string;
  payload: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Auction lifecycle (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let lifecycle: AuctionLifecycleService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    // The sweeper is out of the way: every close below has to come from the auction's own timer.
    restoreEnv = overrideEnv({ AUCTION_SWEEP_INTERVAL_MS: '3600000' });
    app = await createTestApp();
    prisma = app.get(PrismaService);
    lifecycle = app.get(AuctionLifecycleService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    // Timers of earlier tests must not fire into this one.
    await queueOf(app, QUEUE.AUCTIONS).obliterate({ force: true });
  });

  afterAll(async () => {
    await flushEvents();
    await resetDb(prisma);
    await app.close();
    restoreEnv();
  });

  const bid = async (auctionId: string, caller: Caller, amountCents: number) =>
    request(app.getHttpServer())
      .post(`/api/auctions/${auctionId}/bids`)
      .set('Authorization', await bearerFor(app, caller))
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents });

  const inbox = async (caller: Caller): Promise<NotificationBody[]> => {
    const response = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', await bearerFor(app, caller));
    return (response.body as { items: NotificationBody[] }).items;
  };

  /** A running auction (100.00, step 5.00) that ends `endsInMs` from now, with its start event. */
  const open = async (endsInMs: number, durationSec = 60) => {
    const store = await createSeller(prisma);
    const seller: Caller = {
      id: store.user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: store.seller.id,
    };
    const auction = await createAuction(prisma, {
      sellerId: store.seller.id,
      endsAt: new Date(Date.now() + endsInMs),
      durationSec,
    });
    await app.get<AppTransactionHost>(TransactionHost).withTransaction(() =>
      app.get(OutboxService).add([
        {
          type: EVENT_TYPE.AUCTION_STARTED,
          aggregateType: 'Auction',
          aggregateId: auction.id,
          payload: {
            auctionId: auction.id,
            productId: auction.productId,
            round: 1,
            endsAt: auction.endsAt.toISOString(),
          },
        },
      ]),
    );
    return { auction, seller };
  };

  const statusOf = async (id: string) =>
    (await prisma.auction.findUniqueOrThrow({ where: { id } })).status;

  const closedEvents = (auctionId: string) =>
    prisma.outboxEvent.findMany({ where: { eventType: 'auction.closed', aggregateId: auctionId } });

  const closedBy = async (auctionId: string) =>
    waitUntil(async () => (await statusOf(auctionId)) !== 'ACTIVE', {
      timeoutMs: 8_000,
      label: 'the auction timer to close the auction',
    });

  describe('closing', () => {
    it('ends an auction without bids as NOT_SOLD and tells only the seller', async () => {
      const { auction, seller } = await open(1_500);

      await closedBy(auction.id);
      await flushEvents();

      const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      expect(stored).toMatchObject({
        status: 'NOT_SOLD',
        winnerId: null,
        winnerDeadlineAt: null,
        version: 1,
      });
      const events = await closedEvents(auction.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        outcome: 'NOT_SOLD',
        productId: auction.productId,
      });
      expect((await inbox(seller)).map((n) => n.type)).toEqual(['auction.closed']);
    });

    it('sells to the highest bidder with a checkout deadline and tells winner and seller', async () => {
      const { auction, seller } = await open(2_500);
      const alice = await createUser(prisma);
      const bob = await createUser(prisma);
      await bid(auction.id, { id: alice.id }, 10_000);
      await bid(auction.id, { id: bob.id }, 10_500);
      await bid(auction.id, { id: alice.id }, 11_000);

      await closedBy(auction.id);
      await flushEvents();

      const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      expect(stored).toMatchObject({
        status: 'SOLD_TO_WINNER',
        winnerId: alice.id,
        currentPriceCents: 11_000,
      });
      const [deadline] = await prisma.$queryRaw<{ deadline_in_s: number }[]>`
        SELECT extract(epoch FROM (winner_deadline_at - now()))::float AS deadline_in_s
        FROM auctions WHERE id = ${auction.id}::uuid`;
      expect(deadline?.deadline_in_s).toBeGreaterThan(29 * 60);
      expect(deadline?.deadline_in_s).toBeLessThanOrEqual(30 * 60);
      const events = await closedEvents(auction.id);
      expect(events[0]?.payload).toMatchObject({
        outcome: 'SOLD_TO_WINNER',
        winnerId: alice.id,
        priceCents: 11_000,
        round: 1,
      });
      expect((await inbox({ id: alice.id })).map((n) => n.type)).toEqual(['auction.closed']);
      expect((await inbox(seller)).map((n) => n.type)).toEqual(['auction.closed']);
      expect(await inbox({ id: bob.id })).toEqual([]);
    });

    it('sets the timer for the end of the checkout window', async () => {
      const { auction } = await open(1_500);
      await bid(auction.id, { id: (await createUser(prisma)).id }, 10_000);

      await closedBy(auction.id);
      await flushEvents();

      const delayed = await queueOf(app, QUEUE.AUCTIONS).getDelayed();
      expect(delayed.map((job) => [job.name, job.id])).toEqual([
        [AUCTION_JOB.EXPIRE, `${AUCTION_JOB.EXPIRE}-${auction.id}-1`],
      ]);
      await queueOf(app, QUEUE.AUCTIONS).obliterate({ force: true });
    });

    it('does nothing when closed again, or before the deadline', async () => {
      const { auction } = await open(60_000);
      expect(await lifecycle.closeIfDue(auction.id)).toBe(false);
      expect(await statusOf(auction.id)).toBe('ACTIVE');

      await prisma.auction.update({
        where: { id: auction.id },
        data: { endsAt: new Date(Date.now() - 1_000) },
      });
      const results = await Promise.all([
        lifecycle.closeIfDue(auction.id),
        lifecycle.closeIfDue(auction.id),
        lifecycle.closeIfDue(auction.id),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await lifecycle.closeIfDue(auction.id)).toBe(false);
      await flushEvents();
      expect(await closedEvents(auction.id)).toHaveLength(1);
      expect((await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).version).toBe(
        1,
      );
    });
  });

  describe('bids in the last second', () => {
    it('never accepts a bid after the deadline and closes exactly once', async () => {
      const { auction } = await open(2_000);
      const bidders = await Promise.all(Array.from({ length: 12 }, () => createUser(prisma)));
      const closing = (async () => {
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await lifecycle.closeIfDue(auction.id);
          await sleep(50);
        }
      })();

      const bidding = bidders.map(async (user, index) => {
        for (let round = 0; round < 8; round += 1) {
          const amount = 10_000 + (index + round * 12) * 500;
          const response = await bid(auction.id, { id: user.id }, amount);
          expect([201, 409, 422]).toContain(response.status);
          await sleep(300);
        }
      });
      await Promise.all([closing, ...bidding]);
      await flushEvents();

      const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      expect(stored.status).not.toBe('ACTIVE');
      const bids = await prisma.bid.findMany({ where: { auctionId: auction.id } });
      expect(bids.length).toBeGreaterThan(0);
      for (const accepted of bids) {
        expect(accepted.createdAt.getTime()).toBeLessThanOrEqual(stored.endsAt.getTime());
      }
      const top = bids.reduce((best, entry) =>
        entry.amountCents > best.amountCents ? entry : best,
      );
      expect(stored).toMatchObject({
        status: 'SOLD_TO_WINNER',
        winnerId: top.bidderId,
        currentPriceCents: top.amountCents,
        bidCount: bids.length,
      });
      expect(await closedEvents(auction.id)).toHaveLength(1);
    }, 60_000);
  });

  describe('the checkout window', () => {
    const sold = async () => {
      const { auction, seller } = await open(1_200, 1_800);
      const winner = await createUser(prisma);
      await bid(auction.id, { id: winner.id }, 10_000);
      await closedBy(auction.id);
      await flushEvents();
      return { auction, seller, winner };
    };

    it('offers the lot again with the same terms once the window has run out', async () => {
      const { auction, seller, winner } = await sold();
      await prisma.auction.update({
        where: { id: auction.id },
        data: { winnerDeadlineAt: new Date(Date.now() - 1_000) },
      });

      expect(await lifecycle.expireIfDue(auction.id)).toBe(true);
      expect(await lifecycle.expireIfDue(auction.id)).toBe(false);
      await flushEvents();

      const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      expect(stored).toMatchObject({
        status: 'ACTIVE',
        round: 2,
        currentPriceCents: null,
        highestBidId: null,
        highestBidderId: null,
        bidCount: 0,
        winnerId: null,
        winnerDeadlineAt: null,
        startPriceCents: 10_000,
        bidStepCents: 500,
        durationSec: 1_800,
        version: 3,
      });
      const [ends] = await prisma.$queryRaw<{ ends_in_s: number }[]>`
        SELECT extract(epoch FROM (ends_at - now()))::float AS ends_in_s
        FROM auctions WHERE id = ${auction.id}::uuid`;
      expect(ends?.ends_in_s).toBeGreaterThan(1_790);
      expect(ends?.ends_in_s).toBeLessThanOrEqual(1_800);

      const expired = await prisma.outboxEvent.findMany({
        where: { eventType: 'auction.winner_expired' },
      });
      expect(expired).toHaveLength(1);
      expect(expired[0]?.payload).toMatchObject({ previousWinnerId: winner.id, newRound: 2 });
      const started = await prisma.outboxEvent.findMany({
        where: { eventType: 'auction.started', aggregateId: auction.id },
      });
      expect(started).toHaveLength(2);
      expect(await prisma.bid.count({ where: { auctionId: auction.id, round: 1 } })).toBe(1);

      expect((await inbox({ id: winner.id })).map((n) => n.type).sort()).toEqual([
        'auction.closed',
        'auction.winner_expired',
      ]);
      expect((await inbox(seller)).map((n) => n.type).sort()).toEqual([
        'auction.closed',
        'auction.winner_expired',
      ]);
      const timers = (await queueOf(app, QUEUE.AUCTIONS).getDelayed()).map((job) => job.id);
      expect(timers).toContain(`${AUCTION_JOB.CLOSE}-${auction.id}-2`);
      await queueOf(app, QUEUE.AUCTIONS).obliterate({ force: true });
    });

    it('leaves the lot with the winner while the window is open', async () => {
      const { auction } = await sold();

      expect(await lifecycle.expireIfDue(auction.id)).toBe(false);

      expect(await statusOf(auction.id)).toBe('SOLD_TO_WINNER');
      await queueOf(app, QUEUE.AUCTIONS).obliterate({ force: true });
    });

    it('accepts bids on the new round', async () => {
      const { auction } = await sold();
      await prisma.auction.update({
        where: { id: auction.id },
        data: { winnerDeadlineAt: new Date(Date.now() - 1_000) },
      });
      await lifecycle.expireIfDue(auction.id);
      const newcomer = await createUser(prisma);

      const response = await bid(auction.id, { id: newcomer.id }, 10_000);

      expect(response.status).toBe(201);
      expect(await prisma.bid.count({ where: { auctionId: auction.id, round: 2 } })).toBe(1);
      await queueOf(app, QUEUE.AUCTIONS).obliterate({ force: true });
    });
  });
});
