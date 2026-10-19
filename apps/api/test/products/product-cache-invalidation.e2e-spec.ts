import type { NestExpressApplication } from '@nestjs/platform-express';
import { TransactionHost } from '@nestjs-cls/transactional';
import request from 'supertest';

import { OutboxService } from '../../src/outbox';
import { EVENT_TYPE } from '../../src/outbox/events';
import { PrismaService } from '../../src/prisma';
import type { AppTransactionHost } from '../../src/prisma';
import { resetDb } from '../utils/db';
import { createProduct } from '../utils/factories';
import { flushEvents } from '../utils/flush-events';
import { createTestApp } from '../utils/test-app';

interface PriceBody {
  priceCents: number;
  stock: number;
}

describe('Product page cache invalidation by events (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let outbox: OutboxService;
  let txHost: AppTransactionHost;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    outbox = app.get(OutboxService);
    txHost = app.get<AppTransactionHost>(TransactionHost);
  });

  beforeEach(() => resetDb(prisma));

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  const get = async (id: string) => request(app.getHttpServer()).get(`/api/products/${id}`);

  /** A change committed behind the request path's back, so only the consumer can clear the page. */
  const publish = (type: 'product.updated' | 'product.archived', productId: string) =>
    txHost.withTransaction(() =>
      outbox.add([
        type === 'product.updated'
          ? {
              type: EVENT_TYPE.PRODUCT_UPDATED,
              aggregateType: 'Product',
              aggregateId: productId,
              payload: { productId, version: 1, changed: ['priceCents'] },
            }
          : {
              type: EVENT_TYPE.PRODUCT_ARCHIVED,
              aggregateType: 'Product',
              aggregateId: productId,
              payload: { productId },
            },
      ]),
    );

  it('replaces a stale cached page once the product.updated event is consumed', async () => {
    const product = await createProduct(prisma, { priceCents: 10_000 });
    await get(product.id);
    await prisma.product.update({ where: { id: product.id }, data: { priceCents: 8_000 } });
    expect(((await get(product.id)).body as PriceBody).priceCents).toBe(10_000);

    await publish('product.updated', product.id);
    await flushEvents();

    expect(((await get(product.id)).body as PriceBody).priceCents).toBe(8_000);
  });

  it('removes an archived product from the cache after product.archived', async () => {
    const product = await createProduct(prisma);
    await get(product.id);
    await prisma.product.update({
      where: { id: product.id },
      data: { archivedAt: new Date(), isPublished: false },
    });
    expect((await get(product.id)).status).toBe(200);

    await publish('product.archived', product.id);
    await flushEvents();

    expect((await get(product.id)).status).toBe(404);
  });
});
