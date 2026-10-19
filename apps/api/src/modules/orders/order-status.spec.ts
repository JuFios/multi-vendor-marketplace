import { aggregateOrderStatus, type SellerOrderStatusValue as S } from './order-status';

describe('aggregateOrderStatus', () => {
  it.each<[S[], string, boolean]>([
    [['NEW'], 'NEW', false],
    [['NEW', 'NEW'], 'NEW', false],
    [['PROCESSING'], 'PROCESSING', false],
    [['NEW', 'PROCESSING'], 'PROCESSING', false],
    [['PROCESSING', 'PROCESSING'], 'PROCESSING', false],
    [['SHIPPED'], 'SHIPPED', false],
    [['SHIPPED', 'SHIPPED'], 'SHIPPED', false],
    [['SHIPPED', 'COMPLETED'], 'SHIPPED', false],
    [['NEW', 'SHIPPED'], 'PARTIALLY_SHIPPED', false],
    [['PROCESSING', 'SHIPPED'], 'PARTIALLY_SHIPPED', false],
    [['NEW', 'COMPLETED'], 'PARTIALLY_SHIPPED', false],
    [['PROCESSING', 'COMPLETED'], 'PARTIALLY_SHIPPED', false],
    [['COMPLETED'], 'COMPLETED', false],
    [['COMPLETED', 'COMPLETED'], 'COMPLETED', false],
    [['CANCELLED'], 'CANCELLED', false],
    [['CANCELLED', 'CANCELLED'], 'CANCELLED', false],
    [['CANCELLED', 'NEW'], 'NEW', true],
    [['CANCELLED', 'PROCESSING'], 'PROCESSING', true],
    [['CANCELLED', 'SHIPPED'], 'SHIPPED', true],
    [['CANCELLED', 'COMPLETED'], 'COMPLETED', true],
    [['CANCELLED', 'NEW', 'SHIPPED'], 'PARTIALLY_SHIPPED', true],
    [['CANCELLED', 'SHIPPED', 'COMPLETED'], 'SHIPPED', true],
    [[], 'CANCELLED', false],
  ])('%j is %s (cancelled parts: %s)', (statuses, status, hasCancelledParts) => {
    expect(aggregateOrderStatus(statuses)).toEqual({ status, hasCancelledParts });
  });
});
