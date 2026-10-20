import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../../src/prisma/prisma.service';
import { createAuction, createSeller, createUser } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';
import { waitUntil } from '../utils/wait-until';

describe('Auction sweeper (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => resetState(prisma));

  afterAll(async () => {
    await flushEvents();
    await resetState(prisma);
    await app.close();
  });

  const statusOf = async (id: string) =>
    (await prisma.auction.findUniqueOrThrow({ where: { id } })).status;

  it('closes an auction whose timer was lost', async () => {
    const store = await createSeller(prisma);
    // No `auction.started` event was ever recorded, so no timer exists.
    const auction = await createAuction(prisma, {
      sellerId: store.seller.id,
      endsAt: new Date(Date.now() - 1_000),
    });

    await waitUntil(async () => (await statusOf(auction.id)) === 'NOT_SOLD', {
      timeoutMs: 8_000,
      label: 'the sweeper to close the auction',
    });

    await flushEvents();
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'auction.closed', aggregateId: auction.id },
      }),
    ).toBe(1);
  });

  it('offers a lot again when the winner’s window ran out without a timer', async () => {
    const store = await createSeller(prisma);
    const winner = await createUser(prisma);
    const auction = await createAuction(prisma, { sellerId: store.seller.id });
    const bid = await prisma.bid.create({
      data: { auctionId: auction.id, round: 1, bidderId: winner.id, amountCents: 10_000 },
    });
    await prisma.auction.update({
      where: { id: auction.id },
      data: {
        status: 'SOLD_TO_WINNER',
        currentPriceCents: 10_000,
        highestBidId: bid.id,
        highestBidderId: winner.id,
        bidCount: 1,
        winnerId: winner.id,
        winnerDeadlineAt: new Date(Date.now() - 1_000),
      },
    });

    await waitUntil(async () => (await statusOf(auction.id)) === 'ACTIVE', {
      timeoutMs: 8_000,
      label: 'the sweeper to start a new round',
    });

    const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(stored).toMatchObject({ round: 2, bidCount: 0, winnerId: null });
    await flushEvents();
  });

  it('leaves auctions that are not due alone', async () => {
    const store = await createSeller(prisma);
    const auction = await createAuction(prisma, { sellerId: store.seller.id });
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(await statusOf(auction.id)).toBe('ACTIVE');
  });
});
