import { describe, expect, it } from 'vitest';

import { toResolveBody, validateResolution, type ResolutionValues } from './dispute-resolution';

const order = {
  items: [
    {
      id: 'i1',
      productId: 'p1',
      title: 'Keyboard',
      unitPriceCents: 1000,
      quantity: 3,
      refundedQuantity: 1,
      lineTotalCents: 3000,
    },
  ],
};

const buyer: ResolutionValues = {
  outcome: 'RESOLVED_BUYER_FAVOR',
  quantities: { i1: 2 },
  finalStatus: 'CANCELLED',
  note: 'Item was damaged',
};

describe('dispute resolution', () => {
  it('sends refund items and the final status when the buyer wins', () => {
    expect(toResolveBody(buyer)).toEqual({
      outcome: 'RESOLVED_BUYER_FAVOR',
      note: 'Item was damaged',
      refundItems: [{ sellerOrderItemId: 'i1', quantity: 2 }],
      sellerOrderFinalStatus: 'CANCELLED',
    });
  });

  it('drops refund items and the final status when the seller wins', () => {
    expect(toResolveBody({ ...buyer, outcome: 'RESOLVED_SELLER_FAVOR' })).toEqual({
      outcome: 'RESOLVED_SELLER_FAVOR',
      note: 'Item was damaged',
    });
  });

  it('allows a buyer-favour ruling with no refund and no status change', () => {
    expect(toResolveBody({ ...buyer, quantities: {}, finalStatus: '' })).toEqual({
      outcome: 'RESOLVED_BUYER_FAVOR',
      note: 'Item was damaged',
    });
  });

  it('requires a note and rejects refunds above what is left', () => {
    expect(validateResolution({ ...buyer, note: '  ' }, order)).toMatch(/note/);
    expect(validateResolution({ ...buyer, quantities: { i1: 3 } }, order)).toMatch(
      /at most|more than 2/,
    );
    expect(validateResolution(buyer, order)).toBeNull();
  });
});
