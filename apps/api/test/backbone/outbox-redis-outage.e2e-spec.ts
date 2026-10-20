import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';

import { AuctionsProcessor } from '../../src/modules/bidding/auctions.processor';
import { CartProcessor } from '../../src/modules/cart/cart.processor';
import { NotificationsProcessor } from '../../src/modules/notifications/notifications.processor';
import { RealtimeProcessor } from '../../src/modules/notifications/realtime.processor';
import { OrdersSagaProcessor } from '../../src/modules/orders/orders-saga.processor';
import { PaymentsProcessor } from '../../src/modules/payments-ledger/payments.processor';
import { PayoutsProcessor } from '../../src/modules/payments-ledger/payouts.processor';
import { ProductsCacheProcessor } from '../../src/modules/products/products-cache.processor';
import { SearchSyncProcessor } from '../../src/modules/search-sync/search-sync.processor';
import { newEventId } from '../../src/outbox/events/event-id';
import { EVENT_ROUTES, EVENT_ROUTING } from '../../src/outbox/events/event-routes';
import { EVENT_TYPE } from '../../src/outbox/events/event-types';
import { OutboxService } from '../../src/outbox/outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { AppTransactionHost } from '../../src/prisma/transaction';
import { QUEUE } from '../../src/queue/queue-names';
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
      // This spec is about the relay; a consumer's BullMQ worker cannot close while Redis is down.
      { token: ProductsCacheProcessor, useValue: {} },
      { token: SearchSyncProcessor, useValue: {} },
      { token: PaymentsProcessor, useValue: {} },
      { token: PayoutsProcessor, useValue: {} },
      { token: OrdersSagaProcessor, useValue: {} },
      { token: NotificationsProcessor, useValue: {} },
      { token: RealtimeProcessor, useValue: {} },
      { token: AuctionsProcessor, useValue: {} },
      { token: CartProcessor, useValue: {} },
      {
        token: EVENT_ROUTING,
        useValue: { ...EVENT_ROUTES, [EVENT_TYPE.DISPUTE_OPENED]: [QUEUE.REALTIME] },
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
          type: EVENT_TYPE.DISPUTE_OPENED,
          aggregateType: 'Dispute',
          aggregateId: productId,
          payload: {
            disputeId: productId,
            sellerOrderId: productId,
            customerId: productId,
            sellerId: productId,
          },
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
