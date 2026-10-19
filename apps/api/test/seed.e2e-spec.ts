import type { NestExpressApplication } from '@nestjs/platform-express';

import { runSeed } from '../prisma/seed/run-seed';
import { parseSeedEnv } from '../prisma/seed/seed-env';
import { loadEnvFiles } from '../src/config/env-files';
import { PrismaService } from '../src/prisma';

import { resetDb } from './utils/db';
import { createTestApp } from './utils/test-app';

// The seed reads its own variables, which the application config does not export.
loadEnvFiles();

async function snapshot(prisma: PrismaService): Promise<Record<string, number>> {
  const [users, sellers, categories, products, auctions, bids, outbox] = await Promise.all([
    prisma.user.count(),
    prisma.sellerProfile.count(),
    prisma.category.count(),
    prisma.product.count(),
    prisma.auction.count(),
    prisma.bid.count(),
    prisma.outboxEvent.count(),
  ]);
  return { users, sellers, categories, products, auctions, bids, outbox };
}

describe('Database seed (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
    await resetDb(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  it('seeds the demo data and is idempotent', async () => {
    const env = parseSeedEnv(process.env);

    await runSeed(prisma, env);
    const first = await snapshot(prisma);
    await runSeed(prisma, env);
    const second = await snapshot(prisma);

    expect(first).toEqual({
      users: 8,
      sellers: 4,
      categories: 6,
      products: 46,
      auctions: 4,
      bids: 3,
      outbox: 0,
    });
    expect(second).toEqual(first);
  });

  it('creates the admin and approved and pending sellers', async () => {
    const env = parseSeedEnv(process.env);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: env.ADMIN_EMAIL } });
    const approved = await prisma.sellerProfile.count({ where: { status: 'APPROVED' } });
    const pending = await prisma.sellerProfile.count({ where: { status: 'PENDING' } });

    expect(admin.roles).toContain('ADMIN');
    expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
    expect({ approved, pending }).toEqual({ approved: 3, pending: 1 });
  });

  it('seeds a mix of stock levels, one auction ending soon and one with bids', async () => {
    const scarce = await prisma.product.count({
      where: { type: 'FIXED_PRICE', stock: { gte: 1, lte: 3 } },
    });
    const withBids = await prisma.auction.findFirstOrThrow({ where: { bidCount: { gt: 0 } } });
    const [soon] = await prisma.$queryRaw<{ minutes: number }[]>`
      SELECT (extract(epoch FROM (min(ends_at) - now())) / 60)::float AS minutes FROM auctions`;

    expect(scarce).toBeGreaterThan(0);
    expect(withBids.highestBidId).not.toBeNull();
    expect(withBids.currentPriceCents).toBe(92_500);
    expect(soon?.minutes).toBeGreaterThan(3);
    expect(soon?.minutes).toBeLessThan(6);
  });
});
