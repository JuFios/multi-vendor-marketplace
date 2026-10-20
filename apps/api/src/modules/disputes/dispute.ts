import {
  DisputeClosedError,
  DisputeNotAllowedError,
  InvalidResolutionError,
} from './disputes.errors';

export type DisputeStatusValue =
  'OPEN' | 'UNDER_REVIEW' | 'RESOLVED_BUYER_FAVOR' | 'RESOLVED_SELLER_FAVOR';
export type DisputeParty = 'CUSTOMER' | 'SELLER' | 'ADMIN';

export interface DisputeRecord {
  readonly id: string;
  readonly orderId: string;
  readonly sellerOrderId: string;
  readonly customerId: string;
  readonly sellerId: string;
  readonly reason: string;
  readonly status: DisputeStatusValue;
  readonly resolutionNote: string | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
}

export interface DisputeMessageRecord {
  readonly id: string;
  readonly disputeId: string;
  readonly authorId: string;
  readonly authorRole: string;
  readonly text: string;
  readonly createdAt: Date;
}

export interface NewDispute {
  readonly orderId: string;
  readonly sellerOrderId: string;
  readonly customerId: string;
  readonly sellerId: string;
  readonly reason: string;
}

/** Who asks: the customer side always, the store side once the user has an approved store. */
export interface DisputeViewer {
  readonly userId: string;
  readonly sellerId?: string | undefined;
  readonly isAdmin: boolean;
}

const DISPUTABLE_SELLER_ORDER_STATUSES: readonly string[] = ['PROCESSING', 'SHIPPED', 'COMPLETED'];
const OPEN_STATUSES: readonly DisputeStatusValue[] = ['OPEN', 'UNDER_REVIEW'];

export const isOpen = (status: DisputeStatusValue): boolean => OPEN_STATUSES.includes(status);

/** A dispute can be opened once the seller order is being fulfilled and until it is cancelled (I-12). */
export function assertDisputable(sellerOrderStatus: string): void {
  if (!DISPUTABLE_SELLER_ORDER_STATUSES.includes(sellerOrderStatus)) {
    throw new DisputeNotAllowedError(sellerOrderStatus);
  }
}

export function assertOpen(status: DisputeStatusValue): void {
  if (!isOpen(status)) {
    throw new DisputeClosedError();
  }
}

/**
 * The part the viewer plays in the dispute, or null when it is none of their business. An
 * admin outranks the other roles; a user who is both parties (own store) counts as the customer.
 */
export function roleInDispute(
  dispute: Pick<DisputeRecord, 'customerId' | 'sellerId'>,
  viewer: DisputeViewer,
): DisputeParty | null {
  if (viewer.isAdmin) {
    return 'ADMIN';
  }
  if (dispute.customerId === viewer.userId) {
    return 'CUSTOMER';
  }
  if (viewer.sellerId !== undefined && dispute.sellerId === viewer.sellerId) {
    return 'SELLER';
  }
  return null;
}

export type ResolutionOutcome = Extract<
  DisputeStatusValue,
  'RESOLVED_BUYER_FAVOR' | 'RESOLVED_SELLER_FAVOR'
>;
export type FinalSellerOrderStatus = 'CANCELLED' | 'COMPLETED';

export interface Resolution {
  readonly outcome: ResolutionOutcome;
  readonly refundItems?: readonly { sellerOrderItemId: string; quantity: number }[] | undefined;
  readonly sellerOrderFinalStatus?: FinalSellerOrderStatus | undefined;
  readonly note: string;
}

/** Refunds and a new seller order status only make sense when the decision favours the buyer. */
export function assertValidResolution(resolution: Resolution): void {
  const changesAnything =
    (resolution.refundItems?.length ?? 0) > 0 || resolution.sellerOrderFinalStatus !== undefined;
  if (resolution.outcome === 'RESOLVED_SELLER_FAVOR' && changesAnything) {
    throw new InvalidResolutionError(
      'A decision in favour of the seller cannot refund items or change the seller order status',
    );
  }
}
