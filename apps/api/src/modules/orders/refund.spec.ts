import { AppError } from '../../common/exceptions/app-error';

import {
  assertRefundable,
  planRefund,
  planRefundRestock,
  type RefundableSellerOrder,
} from './refund';

/** The error code a call fails with; undefined when it does not fail. */
const codeOf = (call: () => unknown): string | undefined => {
  try {
    call();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_AN_APP_ERROR';
  }
  return undefined;
};

const sellerOrder = (overrides: Partial<RefundableSellerOrder> = {}): RefundableSellerOrder => ({
  status: 'SHIPPED',
  paymentStatus: 'CAPTURED',
  subtotalCents: 10_000,
  refundedCents: 0,
  commissionRateBps: 1_000,
  commissionCents: 1_000,
  items: [
    { id: 'i1', unitPriceCents: 2_000, quantity: 3, refundedQuantity: 0 },
    { id: 'i2', unitPriceCents: 4_000, quantity: 1, refundedQuantity: 0 },
  ],
  ...overrides,
});

describe('planRefund', () => {
  it('prices the lines at the unit price and recomputes the commission', () => {
    const plan = planRefund(sellerOrder(), [{ sellerOrderItemId: 'i1', quantity: 2 }]);

    expect(plan).toEqual({
      lines: [{ sellerOrderItemId: 'i1', quantity: 2, amountCents: 4_000 }],
      amountCents: 4_000,
      refundedCents: 4_000,
      commissionCents: 600,
      commissionReversalCents: 400,
      payoutCents: 5_400,
    });
  });

  it('rounds the new commission half up and keeps the books balanced', () => {
    const order = sellerOrder({ subtotalCents: 10_005, commissionCents: 1_001 });
    const plan = planRefund(order, [{ sellerOrderItemId: 'i2', quantity: 1 }]);

    expect(plan.commissionCents).toBe(601);
    expect(plan.commissionReversalCents).toBe(400);
    expect(plan.refundedCents + plan.commissionCents + plan.payoutCents).toBe(10_005);
  });

  it('counts what was refunded before', () => {
    const order = sellerOrder({
      refundedCents: 2_000,
      commissionCents: 800,
      items: [{ id: 'i1', unitPriceCents: 2_000, quantity: 3, refundedQuantity: 1 }],
    });

    expect(codeOf(() => planRefund(order, [{ sellerOrderItemId: 'i1', quantity: 3 }]))).toBe(
      'REFUND_EXCEEDS_REMAINING',
    );
    const plan = planRefund(order, [{ sellerOrderItemId: 'i1', quantity: 2 }]);
    expect(plan.refundedCents).toBe(6_000);
    expect(plan.commissionCents).toBe(400);
    expect(plan.commissionReversalCents).toBe(400);
  });

  it('allows refunding everything that is left', () => {
    const plan = planRefund(sellerOrder(), [
      { sellerOrderItemId: 'i1', quantity: 3 },
      { sellerOrderItemId: 'i2', quantity: 1 },
    ]);

    expect(plan.commissionCents).toBe(0);
    expect(plan.payoutCents).toBe(0);
    expect(plan.commissionReversalCents).toBe(1_000);
  });

  it.each([0, -1, 1.5])('rejects the quantity %s', (quantity) => {
    expect(codeOf(() => planRefund(sellerOrder(), [{ sellerOrderItemId: 'i1', quantity }]))).toBe(
      'REFUND_EXCEEDS_REMAINING',
    );
  });

  it('rejects an item that belongs to another seller order', () => {
    expect(codeOf(() => planRefund(sellerOrder(), [{ sellerOrderItemId: 'x', quantity: 1 }]))).toBe(
      'REFUND_ITEM_NOT_FOUND',
    );
  });
});

describe('assertRefundable', () => {
  it.each(['PROCESSING', 'SHIPPED', 'COMPLETED'] as const)('accepts a paid %s order', (status) => {
    expect(codeOf(() => assertRefundable({ status, paymentStatus: 'CAPTURED' }))).toBeUndefined();
  });

  it.each(['NEW', 'CANCELLED'] as const)('rejects a %s order', (status) => {
    expect(codeOf(() => assertRefundable({ status, paymentStatus: 'CAPTURED' }))).toBe(
      'REFUND_NOT_ALLOWED',
    );
  });

  it.each(['PENDING', 'FAILED', 'REFUNDED'] as const)('rejects a %s payment', (paymentStatus) => {
    expect(codeOf(() => assertRefundable({ status: 'SHIPPED', paymentStatus }))).toBe(
      'PAYMENT_NOT_CAPTURED',
    );
  });
});

describe('planRefundRestock', () => {
  const items = [
    { id: 'i1', productId: 'p1', auctionId: null },
    { id: 'i2', productId: 'p2', auctionId: 'a2' },
  ];
  const lines = [
    { sellerOrderItemId: 'i1', quantity: 2 },
    { sellerOrderItemId: 'i2', quantity: 1 },
  ];

  it('gives back the refunded units of a processing order, except an auction lot', () => {
    expect(planRefundRestock('PROCESSING', items, lines)).toEqual([
      { productId: 'p1', quantity: 2 },
    ]);
  });

  it.each(['SHIPPED', 'COMPLETED'] as const)(
    'gives back nothing once the order is %s',
    (status) => {
      expect(planRefundRestock(status, items, lines)).toEqual([]);
    },
  );
});
