import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

interface ErrorBody {
  error: { code: string };
}

interface ResolveBody {
  dispute: { id: string; status: string; resolutionNote: string };
  refund: { amountCents: number } | null;
  sellerOrder: { status: string; refundedCents: number };
}

describe('Dispute resolution (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(() => resetDb(prisma));

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** A shipped, paid seller order of 3 × 20.00 and 1 × 40.00, with a dispute opened on it. */
  const world = async () => {
    const buyer = await createUser(prisma);
    const store = await createSeller(prisma);
    const first = await createProduct(prisma, {
      sellerId: store.seller.id,
      priceCents: 2_000,
      stock: 10,
    });
    const second = await createProduct(prisma, {
      sellerId: store.seller.id,
      priceCents: 4_000,
      stock: 10,
    });
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: [
        { cartId: cart.id, productId: first.id, quantity: 3 },
        { cartId: cart.id, productId: second.id, quantity: 1 },
      ],
    });
    const buyerAuth = await bearerFor(app, { id: buyer.id });
    const checkout = await http()
      .post('/api/orders/checkout')
      .set('Authorization', buyerAuth)
      .set('Idempotency-Key', randomUUID());
    const orderId = (checkout.body as { id: string }).id;
    const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId } });
    await prisma.sellerOrder.update({
      where: { id: sellerOrder.id },
      data: { status: 'SHIPPED', paymentStatus: 'CAPTURED' },
    });
    const items = await prisma.sellerOrderItem.findMany({
      where: { sellerOrderId: sellerOrder.id },
    });
    const dispute = await http()
      .post('/api/disputes')
      .set('Authorization', buyerAuth)
      .send({ sellerOrderId: sellerOrder.id, reason: 'Not as described' })
      .expect(201);
    return {
      buyerAuth,
      sellerOrderId: sellerOrder.id,
      disputeId: (dispute.body as { id: string }).id,
      firstItem: items.find((item) => item.productId === first.id)!.id,
      firstProductId: first.id,
      adminAuth: await bearerFor(app, {
        id: (await createUser(prisma, { roles: ['ADMIN'] })).id,
        roles: ['ADMIN'],
      }),
    };
  };

  const resolve = (adminAuth: string, disputeId: string, body: object, key = randomUUID()) =>
    http()
      .post(`/api/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', adminAuth)
      .set('Idempotency-Key', key)
      .send(body);

  it('takes a dispute into review once', async () => {
    const { adminAuth, buyerAuth, disputeId } = await world();
    const review = () =>
      http().post(`/api/admin/disputes/${disputeId}/review`).set('Authorization', adminAuth);

    expect(((await review().expect(200)).body as { status: string }).status).toBe('UNDER_REVIEW');
    const again = await review().expect(409);

    expect((again.body as ErrorBody).error.code).toBe('DISPUTE_ALREADY_UNDER_REVIEW');
    await http()
      .post(`/api/admin/disputes/${disputeId}/review`)
      .set('Authorization', buyerAuth)
      .expect(403);
  });

  it('lists disputes for admins, filtered by status', async () => {
    const { adminAuth, buyerAuth, disputeId } = await world();
    await http().get('/api/admin/disputes').set('Authorization', buyerAuth).expect(403);

    const open = await http()
      .get('/api/admin/disputes?status=OPEN')
      .set('Authorization', adminAuth)
      .expect(200);
    const resolved = await http()
      .get('/api/admin/disputes?status=RESOLVED_BUYER_FAVOR')
      .set('Authorization', adminAuth)
      .expect(200);

    expect((open.body as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([disputeId]);
    expect((resolved.body as { total: number }).total).toBe(0);
  });

  it('resolves for the buyer: partial refund, cancelled seller order, books and event', async () => {
    const { adminAuth, disputeId, sellerOrderId, firstItem, firstProductId } = await world();

    const response = await resolve(adminAuth, disputeId, {
      outcome: 'RESOLVED_BUYER_FAVOR',
      refundItems: [{ sellerOrderItemId: firstItem, quantity: 2 }],
      sellerOrderFinalStatus: 'CANCELLED',
      note: 'Goods were damaged',
    }).expect(200);

    const body = response.body as ResolveBody;
    expect(body.dispute).toMatchObject({
      status: 'RESOLVED_BUYER_FAVOR',
      resolutionNote: 'Goods were damaged',
    });
    expect(body.refund?.amountCents).toBe(4_000);
    expect(body.sellerOrder.status).toBe('CANCELLED');

    const refunds = await prisma.refund.findMany();
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ disputeId, amountCents: 4_000, actorType: 'ADMIN' });
    const stored = await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    expect(stored.resolvedAt).not.toBeNull();
    expect(stored.resolvedById).not.toBeNull();
    const so = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrderId } });
    expect(so).toMatchObject({ status: 'CANCELLED', commissionCents: 0, payoutCents: 0 });
    const history = await prisma.sellerOrderStatusHistory.findMany({
      where: { sellerOrderId, toStatus: 'CANCELLED' },
    });
    expect(history).toMatchObject([{ fromStatus: 'SHIPPED', actorType: 'ADMIN' }]);
    const entries = await prisma.ledgerEntry.findMany({ where: { sellerOrderId } });
    expect(entries.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(0);
    // Shipped goods stay with the buyer's side: nothing goes back to the shelf.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: firstProductId } })).stock).toBe(
      7,
    );
    const events = await prisma.outboxEvent.findMany({ where: { eventType: 'dispute.resolved' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ disputeId, outcome: 'RESOLVED_BUYER_FAVOR' });
  });

  it('can finish the seller order as completed', async () => {
    const { adminAuth, disputeId, sellerOrderId } = await world();

    const response = await resolve(adminAuth, disputeId, {
      outcome: 'RESOLVED_BUYER_FAVOR',
      sellerOrderFinalStatus: 'COMPLETED',
      note: 'Received after all',
    }).expect(200);

    expect((response.body as ResolveBody).refund).toBeNull();
    expect(
      (await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrderId } })).status,
    ).toBe('COMPLETED');
  });

  it('resolves for the seller without touching the order', async () => {
    const { adminAuth, disputeId, sellerOrderId } = await world();

    const response = await resolve(adminAuth, disputeId, {
      outcome: 'RESOLVED_SELLER_FAVOR',
      note: 'Item was as described',
    }).expect(200);

    expect((response.body as ResolveBody).dispute.status).toBe('RESOLVED_SELLER_FAVOR');
    expect(
      (await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrderId } })).status,
    ).toBe('SHIPPED');
    expect(await prisma.refund.count()).toBe(0);
  });

  it('refuses refunds and status changes in a decision for the seller', async () => {
    const { adminAuth, disputeId, firstItem } = await world();

    const response = await resolve(adminAuth, disputeId, {
      outcome: 'RESOLVED_SELLER_FAVOR',
      refundItems: [{ sellerOrderItemId: firstItem, quantity: 1 }],
      note: 'Nope',
    }).expect(400);

    expect((response.body as ErrorBody).error.code).toBe('DISPUTE_RESOLUTION_INVALID');
  });

  it('rolls everything back when the refund is not possible', async () => {
    const { adminAuth, disputeId, sellerOrderId, firstItem } = await world();

    const response = await resolve(adminAuth, disputeId, {
      outcome: 'RESOLVED_BUYER_FAVOR',
      refundItems: [{ sellerOrderItemId: firstItem, quantity: 4 }],
      sellerOrderFinalStatus: 'CANCELLED',
      note: 'Too much',
    }).expect(422);

    expect((response.body as ErrorBody).error.code).toBe('REFUND_EXCEEDS_REMAINING');
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } })).status).toBe(
      'OPEN',
    );
    expect(
      (await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrderId } })).status,
    ).toBe('SHIPPED');
    expect(await prisma.refund.count()).toBe(0);
  });

  it('rejects a second resolution and replays the first one for the same key', async () => {
    const { adminAuth, disputeId, firstItem } = await world();
    const key = randomUUID();
    const body = {
      outcome: 'RESOLVED_BUYER_FAVOR',
      refundItems: [{ sellerOrderItemId: firstItem, quantity: 1 }],
      note: 'Refund one',
    };
    const first = await resolve(adminAuth, disputeId, body, key).expect(200);

    const replay = await resolve(adminAuth, disputeId, body, key).expect(200);
    const second = await resolve(adminAuth, disputeId, body).expect(409);

    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect((second.body as ErrorBody).error.code).toBe('DISPUTE_CLOSED');
    expect(await prisma.refund.count()).toBe(1);
  });

  it('requires an Idempotency-Key, the admin role and a known dispute', async () => {
    const { adminAuth, buyerAuth, disputeId } = await world();
    const body = { outcome: 'RESOLVED_SELLER_FAVOR', note: 'x' };

    await http()
      .post(`/api/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', adminAuth)
      .send(body)
      .expect(400);
    await resolve(buyerAuth, disputeId, body).expect(403);
    await resolve(adminAuth, randomUUID(), body).expect(404);
    await resolve(adminAuth, disputeId, { ...body, note: ' ' }).expect(400);
  });
});
