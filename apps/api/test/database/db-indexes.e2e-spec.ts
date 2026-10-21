import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from '../utils/test-app';

describe('DB indexes (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const definitionOf = async (name: string): Promise<string | undefined> => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}`;
    return rows[0]?.indexdef;
  };

  it.each([
    ['products_id_version_idx', '(id, version)'],
    ['auctions_id_version_idx', '(id, version)'],
    ['bids_auction_id_round_amount_cents_idx', '(auction_id, round, amount_cents DESC)'],
    ['auctions_status_ends_at_idx', '(status, ends_at)'],
    ['auctions_status_winner_deadline_at_idx', '(status, winner_deadline_at)'],
    ['products_category_id_idx', '(category_id)'],
    ['products_seller_id_created_at_idx', '(seller_id, created_at)'],
    ['products_is_published_archived_at_idx', '(is_published, archived_at)'],
    ['products_title_trgm_idx', 'gin_trgm_ops'],
    ['outbox_events_unpublished_idx', 'WHERE (published_at IS NULL)'],
  ])('has %s on the columns the locking and search paths use', async (name, expected) => {
    const definition = await definitionOf(name);

    expect(definition).toBeDefined();
    expect(definition).toContain(expected);
  });
});
