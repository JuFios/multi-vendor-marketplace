import type { INestApplication } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Redis } from 'ioredis';
import type { Meilisearch } from 'meilisearch';
import type { App } from 'supertest/types';

import { type AppTransactionHost, PrismaService } from '../../src/infrastructure/prisma';
import { REDIS_CLIENT } from '../../src/infrastructure/redis';
import { MEILI_CLIENT } from '../../src/infrastructure/search';
import { createTestApp } from '../helpers/test-app';

describe('Infrastructure wiring (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs against the test database', async () => {
    const prisma = app.get(PrismaService);

    const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;

    expect(row?.db).toBe('marketplace_test');
  });

  it('propagates one transaction through the CLS transaction host', async () => {
    const txHost = app.get<AppTransactionHost>(TransactionHost);

    const sameTransaction = await txHost.withTransaction(async () => {
      const [first] = await txHost.tx.$queryRaw<
        { id: string }[]
      >`SELECT txid_current()::text AS id`;
      const [second] = await txHost.tx.$queryRaw<
        { id: string }[]
      >`SELECT txid_current()::text AS id`;
      return first?.id === second?.id;
    });

    expect(sameTransaction).toBe(true);
  });

  it('talks to the isolated Redis database', async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);

    expect(redis.options.db).toBe(1);
    await expect(redis.ping()).resolves.toBe('PONG');
  });

  it('talks to Meilisearch with the configured key', async () => {
    const meili = app.get<Meilisearch>(MEILI_CLIENT);

    await expect(meili.health()).resolves.toEqual({ status: 'available' });
    await expect(meili.getVersion()).resolves.toHaveProperty('pkgVersion');
  });
});
