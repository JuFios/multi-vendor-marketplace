import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import request from 'supertest';

import { WS_NAMESPACE } from '../../src/modules/notifications/ws-events';
import { PrismaService } from '../../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../../src/redis/redis.constants';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import { createAuction, createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';
import { connectSocket, listenOn, type TestSocket } from '../utils/ws-client';

interface AuctionSnapshot {
  channel: 'auction';
  state: {
    auctionId: string;
    status: string;
    currentPriceCents: number | null;
    minNextBidCents: number;
    bidCount: number;
    version: number;
    serverTime: string;
  };
}

describe('Realtime gateway (e2e)', () => {
  const restoreEnv = overrideEnv({ WS_MAX_SUBSCRIPTIONS: '2' });
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let url: string;
  const open: TestSocket[] = [];

  const connect = async (token?: string): Promise<TestSocket> => {
    const client = await connectSocket(url, token);
    open.push(client);
    return client;
  };

  const tokenFor = async (userId: string): Promise<string> =>
    (await bearerFor(app, { id: userId })).slice('Bearer '.length);

  /** Pushes an event to a room the way the worker does. */
  const emitTo = (room: string, event: string, payload: unknown): void => {
    new Emitter(app.get<Redis>(REDIS_CLIENT)).of(WS_NAMESPACE).to(room).emit(event, payload);
  };

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
    url = await listenOn(app);
  });

  beforeEach(() => resetDb(prisma));

  afterEach(() => {
    for (const client of open.splice(0)) {
      client.close();
    }
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
    restoreEnv();
  });

  it('lets an anonymous client follow a product and returns its stock', async () => {
    const product = await createProduct(prisma, { stock: 7 });
    const client = await connect();

    const ack = await client.subscribe('product', product.id);

    expect(ack).toEqual({
      ok: true,
      snapshot: {
        channel: 'product',
        state: { productId: product.id, stock: 7, inStock: true, version: product.version },
      },
    });
  });

  it('returns the auction state with its version and the server clock', async () => {
    const auction = await createAuction(prisma);
    const client = await connect();

    const ack = await client.subscribe('auction', auction.id);

    expect(ack).toMatchObject({
      ok: true,
      snapshot: {
        channel: 'auction',
        state: {
          auctionId: auction.id,
          productId: auction.productId,
          status: 'ACTIVE',
          currentPriceCents: null,
          minNextBidCents: 10_000,
          bidCount: 0,
          version: 0,
        },
      },
    });
    const { serverTime } = (ack as { snapshot: AuctionSnapshot }).snapshot.state;
    expect(Math.abs(Date.parse(serverTime) - Date.now())).toBeLessThan(10_000);
  });

  it('answers a subscription to something that does not exist with an error', async () => {
    const hidden = await createProduct(prisma, { isPublished: false });
    const client = await connect();

    expect(await client.subscribe('auction', randomUUID())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await client.subscribe('product', randomUUID())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await client.subscribe('product', hidden.id)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('refuses private channels, malformed ids and non-objects', async () => {
    const client = await connect();

    for (const body of [
      { channel: 'user', id: randomUUID() },
      { channel: 'seller', id: randomUUID() },
      { channel: 'auction', id: 'nope' },
      'auction',
      null,
    ]) {
      expect(await client.socket.emitWithAck('subscribe', body)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_SUBSCRIPTION' },
      });
    }
  });

  it('caps the channels one connection follows, but lets a followed one refresh', async () => {
    const [a, b, c] = await Promise.all([
      createProduct(prisma),
      createProduct(prisma),
      createProduct(prisma),
    ]);
    const client = await connect();

    expect(await client.subscribe('product', a.id)).toMatchObject({ ok: true });
    expect(await client.subscribe('product', b.id)).toMatchObject({ ok: true });
    expect(await client.subscribe('product', c.id)).toMatchObject({
      ok: false,
      error: { code: 'SUBSCRIPTION_LIMIT' },
    });
    expect(await client.subscribe('product', a.id)).toMatchObject({ ok: true });

    await client.socket.emitWithAck('unsubscribe', { channel: 'product', id: b.id });
    expect(await client.subscribe('product', c.id)).toMatchObject({ ok: true });
  });

  it('stops delivering a room after unsubscribe', async () => {
    const product = await createProduct(prisma);
    const client = await connect();
    await client.subscribe('product', product.id);

    emitTo(`product:${product.id}`, 'probe', 1);
    await client.waitForEvent('probe');
    await client.socket.emitWithAck('unsubscribe', { channel: 'product', id: product.id });
    emitTo(`product:${product.id}`, 'probe', 2);
    emitTo(`product:${product.id}`, 'probe', 3);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(client.eventsOf('probe')).toEqual([1]);
  });

  it('puts a signed-in client in its own user room and keeps everyone else out', async () => {
    const [alice, bob] = await Promise.all([createUser(prisma), createUser(prisma)]);
    const anonymous = await connect();
    const asAlice = await connect(await tokenFor(alice.id));
    const asBob = await connect(await tokenFor(bob.id));

    emitTo(`user:${alice.id}`, 'probe', 'for-alice');
    await asAlice.waitForEvent('probe');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(asAlice.eventsOf('probe')).toEqual(['for-alice']);
    expect(asBob.eventsOf('probe')).toEqual([]);
    expect(anonymous.eventsOf('probe')).toEqual([]);
  });

  it('puts a seller in the room of the store from the token', async () => {
    const { user, seller } = await createSeller(prisma);
    const token = (
      await bearerFor(app, { id: user.id, roles: ['CUSTOMER', 'SELLER'], sellerId: seller.id })
    ).slice('Bearer '.length);
    const asSeller = await connect(token);
    const asCustomer = await connect(await tokenFor((await createUser(prisma)).id));

    emitTo(`seller:${seller.id}`, 'probe', 'for-store');
    await asSeller.waitForEvent('probe');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(asCustomer.eventsOf('probe')).toEqual([]);
  });

  it('refuses a handshake with an invalid, forged or expired token', async () => {
    const user = await createUser(prisma);
    const expired = await app
      .get(JwtService, { strict: false })
      .signAsync({ roles: ['CUSTOMER'] }, { subject: user.id, expiresIn: -10 });

    for (const token of ['garbage', `${await tokenFor(user.id)}x`, expired]) {
      await expect(connectSocket(url, token)).rejects.toMatchObject({
        message: 'UNAUTHORIZED',
        data: { code: 'UNAUTHORIZED' },
      });
    }
  });

  it('closes a signed-in socket when its access token expires', async () => {
    const user = await createUser(prisma);
    const token = await app
      .get(JwtService, { strict: false })
      .signAsync({ roles: ['CUSTOMER'] }, { subject: user.id, expiresIn: 2 });
    const client = await connect(token);
    const disconnected = new Promise<string>((resolve) => {
      client.socket.once('disconnect', resolve);
    });

    emitTo(`user:${user.id}`, 'probe', 'while-valid');
    await client.waitForEvent('probe');
    await expect(disconnected).resolves.toBe('io server disconnect');
    expect(client.socket.connected).toBe(false);
  });

  it('resyncs after a reconnect: the snapshot shows the bids missed while offline', async () => {
    const auction = await createAuction(prisma);
    const bidder = await createUser(prisma);
    const before = await connect();
    const first = (await before.subscribe('auction', auction.id)) as {
      snapshot: AuctionSnapshot;
    };
    before.close();

    for (const amountCents of [10_000, 10_500]) {
      const response = await request(app.getHttpServer())
        .post(`/api/auctions/${auction.id}/bids`)
        .set('Authorization', await bearerFor(app, { id: bidder.id }))
        .set('Idempotency-Key', randomUUID())
        .send({ amountCents });
      expect(response.status).toBe(201);
    }

    const after = await connect();
    const second = (await after.subscribe('auction', auction.id)) as {
      snapshot: AuctionSnapshot;
    };

    expect(second.snapshot.state).toMatchObject({ currentPriceCents: 10_500, bidCount: 2 });
    expect(second.snapshot.state.version).toBeGreaterThan(first.snapshot.state.version);
  });
});
