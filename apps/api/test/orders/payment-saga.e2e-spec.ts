import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { OutboxEvent } from '../../src/generated/prisma/client';
import {
  type CaptureRequest,
  type CaptureResult,
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
} from '../../src/modules/payments-ledger/payment-gateway.port';
import type { UserRole } from '../../src/modules/users/user-role';
import type { AnyDomainEvent } from '../../src/outbox/events/domain-event';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QUEUE } from '../../src/queue/queue-names';
import { QUEUE_PUBLISHER, type QueuePublisherPort } from '../../src/queue/queue-publisher.port';
import { bearerFor } from '../utils/auth';
import { createProduct, createSeller, createUser } from '../utils/factories';
import { flushEvents, queueOf } from '../utils/flush-events';
import { resetState } from '../utils/reset-state';
import { createTestApp } from '../utils/test-app';

/** Stands in for a provider that honours `sellerOrderId` as its idempotency key. */
class FakePaymentGateway implements PaymentGatewayPort {
  readonly calls: CaptureRequest[] = [];
  readonly charges = new Map<string, CaptureResult>();
  readonly declined = new Set<number>();
  gate: Promise<void> | null = null;

  async capture(captureRequest: CaptureRequest): Promise<CaptureResult> {
    this.calls.push(captureRequest);
    if (this.gate) {
      await this.gate;
    }
    const taken = this.charges.get(captureRequest.sellerOrderId);
    if (taken !== undefined) {
      return taken;
    }
    const result: CaptureResult = this.declined.has(captureRequest.amountCents)
      ? { ok: false, reason: 'DECLINED' }
      : { ok: true, providerRef: 'fake' };
    this.charges.set(captureRequest.sellerOrderId, result);
    return result;
  }

  reset(): void {
    this.calls.length = 0;
    this.charges.clear();
    this.declined.clear();
    this.gate = null;
  }
}

interface OrderBody {
  id: string;
  sellerOrders: { id: string; seller: { id: string }; subtotalCents: number }[];
}

interface Caller {
  id: string;
  roles?: UserRole[];
  sellerId?: string;
}

const toEvent = (row: OutboxEvent): AnyDomainEvent =>
  ({
    id: row.id,
    type: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    occurredAt: row.occurredAt.toISOString(),
    correlationId: row.correlationId,
    actorId: row.actorId,
    schemaVersion: 1,
    payload: row.payload,
  }) as unknown as AnyDomainEvent;

describe('Payment saga (e2e)', () => {
  const gateway = new FakePaymentGateway();
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([{ token: PAYMENT_GATEWAY, useValue: gateway }]);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    gateway.reset();
    await resetState(prisma);
  });

  afterAll(async () => {
    await resetState(prisma);
    await app.close();
  });

  const post = async (path: string, caller: Caller, body?: object) => {
    const req = request(app.getHttpServer())
      .post(`/api${path}`)
      .set('Authorization', await bearerFor(app, caller));
    return body === undefined ? req : req.send(body);
  };

  /** Three stores selling one product each at 50.00, 33.35 and 1.00; the buyer takes two of each. */
  const checkout = async () => {
    const buyer = await createUser(prisma);
    const stores = await Promise.all([
      createSeller(prisma),
      createSeller(prisma),
      createSeller(prisma),
    ]);
    const prices = [5_000, 3_335, 100];
    const products = await Promise.all(
      stores.map((store, index) =>
        createProduct(prisma, {
          sellerId: store.seller.id,
          priceCents: prices[index]!,
          stock: 10,
        }),
      ),
    );
    const cart = await prisma.cart.create({
      data: { userId: buyer.id, firstItemAddedAt: new Date() },
    });
    await prisma.cartItem.createMany({
      data: products.map((product) => ({ cartId: cart.id, productId: product.id, quantity: 2 })),
    });
    const response = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set('Authorization', await bearerFor(app, buyer))
      .set('Idempotency-Key', randomUUID());
    const order = response.body as OrderBody;
    const sellerCallers = stores.map((store): Caller => ({
      id: store.user.id,
      roles: ['CUSTOMER', 'SELLER'],
      sellerId: store.seller.id,
    }));
    const soOf = (index: number): string =>
      order.sellerOrders.find((so) => so.seller.id === stores[index]?.seller.id)?.id ?? '';
    return { buyer, order, products, sellerCallers, soOf };
  };

  const stockOf = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  const sellerOrder = (id: string) => prisma.sellerOrder.findUniqueOrThrow({ where: { id } });

  it('captures every seller order after checkout, which unlocks the whole status flow', async () => {
    const { buyer, order, sellerCallers, soOf } = await checkout();
    await flushEvents();

    expect((await prisma.sellerOrder.findMany()).map((so) => so.paymentStatus)).toEqual([
      'CAPTURED',
      'CAPTURED',
      'CAPTURED',
    ]);
    expect(await prisma.paymentAttempt.count({ where: { status: 'CAPTURED' } })).toBe(3);
    expect(gateway.calls.map((call) => call.amountCents).sort((a, b) => a - b)).toEqual([
      200, 6_670, 10_000,
    ]);

    const seller = sellerCallers[0]!;
    const so = soOf(0);
    expect(
      (await post(`/seller/orders/${so}/status`, seller, { status: 'PROCESSING' })).status,
    ).toBe(200);
    expect((await post(`/seller/orders/${so}/status`, seller, { status: 'SHIPPED' })).status).toBe(
      200,
    );
    expect(
      (await post(`/orders/${order.id}/seller-orders/${so}/confirm-receipt`, buyer)).status,
    ).toBe(200);
    expect((await sellerOrder(so)).status).toBe('COMPLETED');
  });

  it('cancels only the seller order whose payment was declined, and restocks it', async () => {
    gateway.declined.add(6_670);
    const { order, products, soOf } = await checkout();
    await flushEvents();

    const [first, declined, third] = [soOf(0), soOf(1), soOf(2)];
    expect(await sellerOrder(declined)).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'FAILED',
      cancelledBy: 'SYSTEM',
      cancelReason: 'PAYMENT_FAILED',
      commissionCents: 0,
      payoutCents: 0,
    });
    expect((await sellerOrder(first)).paymentStatus).toBe('CAPTURED');
    expect((await sellerOrder(third)).paymentStatus).toBe('CAPTURED');
    expect((await sellerOrder(first)).status).toBe('NEW');
    expect(await stockOf((products[0] as { id: string }).id)).toBe(8);
    expect(await stockOf((products[1] as { id: string }).id)).toBe(10);
    expect(await stockOf((products[2] as { id: string }).id)).toBe(8);
    expect(await prisma.paymentAttempt.count({ where: { status: 'CAPTURED' } })).toBe(2);
    expect(await prisma.paymentAttempt.count({ where: { status: 'FAILED' } })).toBe(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'NEW',
      hasCancelledParts: true,
      refundedCents: 6_670,
    });
    const entries = await prisma.ledgerEntry.findMany({ where: { sellerOrderId: declined } });
    expect(entries.map((entry) => entry.amountCents).reduce((sum, amount) => sum + amount, 0)).toBe(
      0,
    );
  });

  it('gives each payment outcome its own seller order version, below the next change', async () => {
    gateway.declined.add(6_670);
    const { sellerCallers, soOf } = await checkout();
    await flushEvents();
    const [captured, declined] = [soOf(0), soOf(1)];
    const versionOf = async (sellerOrderId: string, eventType: string, to?: string) => {
      const rows = await prisma.outboxEvent.findMany({
        where: { aggregateId: sellerOrderId, eventType },
      });
      const row = rows.find((r) => to === undefined || (r.payload as { to?: string }).to === to);
      return (row?.payload as { version: number }).version;
    };

    const capturedAt = await versionOf(captured, 'seller_order.payment_changed');
    expect(capturedAt).toBe((await sellerOrder(captured)).version);
    expect(
      (await post(`/seller/orders/${captured}/status`, sellerCallers[0]!, { status: 'PROCESSING' }))
        .status,
    ).toBe(200);
    await flushEvents();
    expect(await versionOf(captured, 'seller_order.status_changed', 'PROCESSING')).toBe(
      capturedAt + 1,
    );

    // The compensation that follows a decline is the next version, not the same one.
    const failedAt = await versionOf(declined, 'seller_order.payment_changed');
    expect(await versionOf(declined, 'seller_order.status_changed', 'CANCELLED')).toBe(
      failedAt + 1,
    );
    expect((await sellerOrder(declined)).version).toBe(failedAt + 1);
  });

  it('compensates exactly once when payment.failed is delivered again', async () => {
    gateway.declined.add(6_670);
    const { products, soOf } = await checkout();
    await flushEvents();
    const declined = soOf(1);
    const failed = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'payment.failed' },
    });
    const sagaQueue = queueOf(app, QUEUE.ORDERS_SAGA);
    const publisher = app.get<QueuePublisherPort>(QUEUE_PUBLISHER);

    await sagaQueue.remove(failed.id);
    await publisher.publish(QUEUE.ORDERS_SAGA, toEvent(failed));
    await flushEvents();

    expect(await stockOf((products[1] as { id: string }).id)).toBe(10);
    expect(
      await prisma.ledgerEntry.count({ where: { sellerOrderId: declined, type: 'CANCELLATION' } }),
    ).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'seller_order.cancelled' } })).toBe(
      1,
    );
    expect(
      await prisma.processedEvent.count({ where: { consumer: 'orders-saga', eventId: failed.id } }),
    ).toBe(1);
  });

  it('takes the money and records it once when seller_order.created is delivered again', async () => {
    const { soOf } = await checkout();
    await flushEvents();
    const created = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'seller_order.created', aggregateId: soOf(0) },
    });

    await queueOf(app, QUEUE.PAYMENTS).remove(created.id);
    await app.get<QueuePublisherPort>(QUEUE_PUBLISHER).publish(QUEUE.PAYMENTS, toEvent(created));
    await flushEvents();

    // The capture sits outside the recording transaction, so a redelivery can reach the provider
    // once more; the key it carries is what keeps that from taking the money twice.
    expect(gateway.charges.size).toBe(3);
    expect(await prisma.paymentAttempt.count()).toBe(3);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'payment.captured' } })).toBe(3);
  });

  it('refunds a payment that is captured after the seller order was cancelled', async () => {
    let release = (): void => undefined;
    gateway.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { buyer, order, soOf } = await checkout();
    const so = soOf(0);

    const cancelled = await post(`/orders/${order.id}/seller-orders/${so}/cancel`, buyer);
    expect(cancelled.status).toBe(200);
    release();
    await flushEvents();

    expect(await sellerOrder(so)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    expect(
      await prisma.ledgerEntry.count({ where: { sellerOrderId: so, type: 'CANCELLATION' } }),
    ).toBe(1);
  });
});
