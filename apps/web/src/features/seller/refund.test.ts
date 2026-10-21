import { describe, expect, it } from 'vitest';

import { sellerOrder } from '../../test/fixtures';

import { describeRefund, refundableStatus } from './refund';

const order = sellerOrder({
  status: 'SHIPPED',
  subtotalCents: 10000,
  commissionRateBps: 1000,
  commissionCents: 1000,
  payoutCents: 9000,
  items: [
    {
      id: 'i1',
      productId: 'p1',
      title: 'A',
      unitPriceCents: 2500,
      quantity: 4,
      refundedQuantity: 1,
      lineTotalCents: 10000,
    },
  ],
}) as never;

describe('refund preview', () => {
  it('prices the selected units and recalculates commission on what remains', () => {
    const result = describeRefund(order, { quantities: { i1: 2 } });

    expect(result.amountCents).toBe(5000);
    expect(result.commissionAfterCents).toBe(500);
    expect(result.payoutAfterCents).toBe(4500);
    expect(result.commissionReturnedCents).toBe(500);
    expect(result.valid).toBe(true);
  });

  it('rejects more units than are left and an empty selection', () => {
    expect(describeRefund(order, { quantities: { i1: 4 } }).valid).toBe(false);
    expect(describeRefund(order, { quantities: {} }).valid).toBe(false);
  });

  it('allows refunds only for paid shipments that are in progress or done', () => {
    expect(refundableStatus({ status: 'SHIPPED', paymentStatus: 'CAPTURED' })).toBe(true);
    expect(refundableStatus({ status: 'NEW', paymentStatus: 'CAPTURED' })).toBe(false);
    expect(refundableStatus({ status: 'SHIPPED', paymentStatus: 'PENDING' })).toBe(false);
  });
});
