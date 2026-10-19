import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';

import { OutboxService } from '../../src/outbox';
import { EVENT_ROUTES, EVENT_ROUTING, EVENT_TYPE, newEventId } from '../../src/outbox/events';
import { type AppTransactionHost, PrismaService } from '../../src/prisma';
import { QUEUE } from '../../src/queue';
import { resetDb } from '../utils/db';
import { createTestApp } from '../utils/test-app';
import { waitUntil } from '../utils/wait-until';

const UNREACHABLE_REDIS = 'redis://127.0.0.1:1/1';

describe('outbox relay with an unreachable Redis (e2e)', () => {
  const originalRedisUrl = process.env.REDIS_URL;
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.REDIS_URL = UNREACHABLE_REDIS;
    app = await createTestApp([
      {
        token: EVENT_ROUTING,
        useValue: { ...EVENT_ROUTES, [EVENT_TYPE.PRODUCT_CREATED]: [QUEUE.CACHE] },
      },
    ]);
    prisma = app.get(PrismaService);
    await resetDb(prisma);
  });

  afterAll(async () => {
    // The event can never be published here; it must not leak to the next spec's relay.
    await resetDb(prisma);
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
    await app.close();
  });

  it('leaves the event pending with a recorded failure instead of hanging or dropping it', async () => {
    const productId = newEventId();
    const [id] = await app.get<AppTransactionHost>(TransactionHost).withTransaction(() =>
      app.get(OutboxService).add([
        {
          type: EVENT_TYPE.PRODUCT_CREATED,
          aggregateType: 'Product',
          aggregateId: productId,
          payload: { productId, version: 1 },
        },
      ]),
    );

    await waitUntil(
      async () =>
        ((await prisma.outboxEvent.findUnique({ where: { id: id ?? '' } }))?.attempts ?? 0) > 0,
      { timeoutMs: 20_000, label: 'a failed publish attempt to be recorded' },
    );

    const pending = await prisma.outboxEvent.findUnique({ where: { id: id ?? '' } });
    expect(pending?.publishedAt).toBeNull();
    expect(pending?.lastError).toBeTruthy();
  });
});
