import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import { createAuction, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';
import { resetThrottleCounters } from '../utils/throttle';

describe('Bid rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    restoreEnv = overrideEnv({ THROTTLE_BID_LIMIT: '3', THROTTLE_BID_TTL: '60' });
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
    await resetDb(prisma);
  });

  beforeEach(() => resetThrottleCounters(app));

  afterAll(async () => {
    await resetThrottleCounters(app);
    await resetDb(prisma);
    await app.close();
    restoreEnv();
  });

  const bid = async (auctionId: string, userId: string, amountCents: number) =>
    request(app.getHttpServer())
      .post(`/api/auctions/${auctionId}/bids`)
      .set('Authorization', await bearerFor(app, { id: userId }))
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents });

  it('answers the 4th bid of one user within the window with 429, and leaves others alone', async () => {
    const store = await createSeller(prisma);
    const auction = await createAuction(prisma, { sellerId: store.seller.id });
    const eager = await createUser(prisma);
    const other = await createUser(prisma);

    for (let index = 0; index < 3; index += 1) {
      expect((await bid(auction.id, eager.id, 10_000 + index * 500)).status).toBe(201);
    }
    const limited = await bid(auction.id, eager.id, 12_000);
    const unaffected = await bid(auction.id, other.id, 12_000);

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(unaffected.status).toBe(201);
    expect(await prisma.bid.count()).toBe(4);
  });
});
