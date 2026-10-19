export type OrderStatusValue =
  'NEW' | 'PROCESSING' | 'PARTIALLY_SHIPPED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
export type SellerOrderStatusValue = 'NEW' | 'PROCESSING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';

export interface AggregatedOrderStatus {
  readonly status: OrderStatusValue;
  readonly hasCancelledParts: boolean;
}

/**
 * The status of an order from the statuses of its seller orders. Cancelled parts do not
 * count towards it; they only raise `hasCancelledParts` while something is still alive.
 */
export function aggregateOrderStatus(
  statuses: readonly SellerOrderStatusValue[],
): AggregatedOrderStatus {
  const alive = statuses.filter((status) => status !== 'CANCELLED');
  const hasCancelledParts = alive.length > 0 && alive.length < statuses.length;
  const shipped = (status: SellerOrderStatusValue) =>
    status === 'SHIPPED' || status === 'COMPLETED';

  let status: OrderStatusValue;
  if (alive.length === 0) {
    status = 'CANCELLED';
  } else if (alive.every((s) => s === 'COMPLETED')) {
    status = 'COMPLETED';
  } else if (alive.every(shipped)) {
    status = 'SHIPPED';
  } else if (alive.some(shipped)) {
    status = 'PARTIALLY_SHIPPED';
  } else if (alive.some((s) => s === 'PROCESSING')) {
    status = 'PROCESSING';
  } else {
    status = 'NEW';
  }
  return { status, hasCancelledParts };
}
