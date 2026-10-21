import { Logger } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';

import type { IdempotencyService } from '../../idempotency/idempotency.service';
import type { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import type { AuctionsService } from '../bidding/auctions.service';
import type { CheckoutLine } from '../cart/cart';
import type { CartService } from '../cart/cart.service';
import type { LedgerService } from '../payments-ledger/ledger.service';
import type { InventoryService } from '../products/inventory.service';
import type { ReservedProduct } from '../products/product';
import { InsufficientStockError } from '../products/products.errors';
import type { SellersService } from '../sellers/sellers.service';

import { CheckoutService } from './checkout.service';
import type { OrderRecord } from './order';
import type { OrdersRepository } from './orders.repository';

const line = (
  productId: string,
  sellerId: string,
  overrides: Partial<CheckoutLine> = {},
): CheckoutLine => ({
  productId,
  sellerId,
  title: `Product ${productId}`,
  type: 'FIXED_PRICE',
  priceCents: 1_000,
  stock: 10,
  isPublished: true,
  archivedAt: null,
  quantity: 2,
  availability: 'AVAILABLE',
  ...overrides,
});

const reserved = (productId: string, sellerId: string): ReservedProduct => ({
  productId,
  sellerId,
  title: `Product ${productId}`,
  unitPriceCents: 1_000,
  quantity: 2,
  stock: 8,
  version: 1,
});

const order: OrderRecord = {
  id: 'order-1',
  customerId: 'user-1',
  status: 'NEW',
  hasCancelledParts: false,
  subtotalCents: 4_000,
  refundedCents: 0,
  totalCents: 4_000,
  commissionCents: 400,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  sellerOrders: ['s1', 's2'].map((sellerId, index) => ({
    id: `so-${index}`,
    orderId: 'order-1',
    sellerId,
    status: 'NEW',
    paymentStatus: 'PENDING',
    subtotalCents: 2_000,
    refundedCents: 0,
    commissionRateBps: 1000,
    commissionCents: 200,
    payoutCents: 1_800,
    cancelReason: null,
    version: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    items: [],
    statusHistory: [],
  })),
};

describe('CheckoutService', () => {
  const cart = { lockActiveLines: jest.fn(), convert: jest.fn() };
  const inventory = { reserve: jest.fn(), invalidateDetails: jest.fn() };
  const auctions = { settleWonLots: jest.fn() };
  const orders = { create: jest.fn() };
  const ledger = { recordSale: jest.fn() };
  const sellers = { findStoreNames: jest.fn() };
  const outbox = { add: jest.fn() };
  const idempotency = { complete: jest.fn() };
  const created = { inc: jest.fn() };
  const failures = { inc: jest.fn() };
  const txHost = { withTransaction: jest.fn<Promise<unknown>, [() => Promise<unknown>]>() };
  let service: CheckoutService;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    txHost.withTransaction.mockImplementation((work) => work());
    sellers.findStoreNames.mockResolvedValue(new Map());
    auctions.settleWonLots.mockResolvedValue([]);
    service = new CheckoutService(
      txHost as unknown as AppTransactionHost,
      { commissionBps: 1000 },
      created as unknown as Counter,
      failures as unknown as Counter<'reason'>,
      orders as unknown as OrdersRepository,
      cart as unknown as CartService,
      inventory as unknown as InventoryService,
      auctions as unknown as AuctionsService,
      ledger as unknown as LedgerService,
      sellers as unknown as SellersService,
      outbox as unknown as OutboxService,
      idempotency as unknown as IdempotencyService,
    );
  });

  const expectNothingWritten = () => {
    expect(orders.create).not.toHaveBeenCalled();
    expect(ledger.recordSale).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
    expect(cart.convert).not.toHaveBeenCalled();
    expect(idempotency.complete).not.toHaveBeenCalled();
  };

  it('rejects an empty cart', async () => {
    cart.lockActiveLines.mockResolvedValue(null);

    await expect(service.checkout('user-1')).rejects.toMatchObject({ code: 'CART_EMPTY' });

    expect(inventory.reserve).not.toHaveBeenCalled();
    expectNothingWritten();
    expect(failures.inc).toHaveBeenCalledWith({ reason: 'CART_EMPTY' });
  });

  it('lists every unavailable line and takes no stock', async () => {
    cart.lockActiveLines.mockResolvedValue({
      cartId: 'cart-1',
      lines: [
        line('a', 's1', { availability: 'UNAVAILABLE' }),
        line('b', 's2'),
        line('c', 's2', { availability: 'INSUFFICIENT_STOCK' }),
      ],
    });

    await expect(service.checkout('user-1')).rejects.toMatchObject({
      code: 'CART_ITEMS_UNAVAILABLE',
      details: {
        items: [
          { productId: 'a', reason: 'UNAVAILABLE' },
          { productId: 'c', reason: 'INSUFFICIENT_STOCK' },
        ],
      },
    });

    expect(inventory.reserve).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it('writes no order, ledger entry, event or conversion when any seller’s product runs short', async () => {
    cart.lockActiveLines.mockResolvedValue({
      cartId: 'cart-1',
      lines: [line('a', 's1'), line('b', 's2'), line('c', 's3')],
    });
    inventory.reserve.mockRejectedValue(
      new InsufficientStockError([{ productId: 'b', requested: 2, available: 1 }]),
    );

    await expect(service.checkout('user-1')).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { items: [{ productId: 'b', requested: 2, available: 1 }] },
    });

    expectNothingWritten();
    expect(inventory.invalidateDetails).not.toHaveBeenCalled();
    expect(created.inc).not.toHaveBeenCalled();
    expect(failures.inc).toHaveBeenCalledWith({ reason: 'INSUFFICIENT_STOCK' });
  });

  it('prices the order with the reserved products and books one sale per seller order', async () => {
    cart.lockActiveLines.mockResolvedValue({
      cartId: 'cart-1',
      lines: [line('a', 's1'), line('b', 's2')],
    });
    inventory.reserve.mockResolvedValue([reserved('a', 's1'), reserved('b', 's2')]);
    orders.create.mockResolvedValue(order);

    const response = await service.checkout('user-1');

    expect(inventory.reserve).toHaveBeenCalledWith([
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 2 },
    ]);
    const [, groups, bps] = orders.create.mock.calls[0] as [
      string,
      { sellerId: string; subtotalCents: number; commissionCents: number }[],
      number,
    ];
    expect(bps).toBe(1000);
    expect(groups.map((g) => [g.sellerId, g.subtotalCents, g.commissionCents])).toEqual([
      ['s1', 2_000, 200],
      ['s2', 2_000, 200],
    ]);
    expect(ledger.recordSale).toHaveBeenCalledTimes(2);
    expect(ledger.recordSale).toHaveBeenCalledWith({
      sellerOrderId: 'so-0',
      sellerId: 's1',
      subtotalCents: 2_000,
      commissionCents: 200,
    });
    expect(cart.convert).toHaveBeenCalledWith('cart-1', 'order-1');
    expect(outbox.add).toHaveBeenCalledTimes(1);
    expect(outbox.add).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'seller_order.created', aggregateId: 'so-0' }),
      expect.objectContaining({ type: 'seller_order.created', aggregateId: 'so-1' }),
    ]);
    expect(idempotency.complete).toHaveBeenCalledWith(response);
    expect(response).toMatchObject({ id: 'order-1', totalCents: 4_000 });
    expect(inventory.invalidateDetails).toHaveBeenCalledWith(['a', 'b']);
    expect(created.inc).toHaveBeenCalledTimes(1);
  });

  it('refuses to charge a total other than the one the buyer saw, and writes nothing', async () => {
    cart.lockActiveLines.mockResolvedValue({
      cartId: 'cart-1',
      lines: [line('a', 's1'), line('b', 's2')],
    });
    inventory.reserve.mockResolvedValue([reserved('a', 's1'), reserved('b', 's2')]);

    await expect(service.checkout('user-1', 3_500)).rejects.toMatchObject({
      code: 'CHECKOUT_TOTAL_CHANGED',
      details: { expectedTotalCents: 3_500, totalCents: 4_000 },
    });

    expectNothingWritten();
    expect(failures.inc).toHaveBeenCalledWith({ reason: 'CHECKOUT_TOTAL_CHANGED' });
  });

  it('places the order when the expected total matches', async () => {
    cart.lockActiveLines.mockResolvedValue({
      cartId: 'cart-1',
      lines: [line('a', 's1'), line('b', 's2')],
    });
    inventory.reserve.mockResolvedValue([reserved('a', 's1'), reserved('b', 's2')]);
    orders.create.mockResolvedValue(order);

    await expect(service.checkout('user-1', 4_000)).resolves.toMatchObject({ id: 'order-1' });
  });
});
