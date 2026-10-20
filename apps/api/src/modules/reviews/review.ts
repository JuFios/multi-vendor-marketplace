export interface ReviewRecord {
  readonly id: string;
  readonly productId: string;
  readonly authorId: string;
  readonly rating: number;
  readonly text: string;
  readonly createdAt: Date;
}

export interface NewReview {
  readonly productId: string;
  readonly authorId: string;
  readonly sellerOrderItemId: string;
  readonly rating: number;
  readonly text: string;
}

export type IneligibilityReason = 'NOT_PURCHASED' | 'ALREADY_REVIEWED';

export interface Eligibility {
  readonly eligible: boolean;
  readonly reason: IneligibilityReason | null;
}

/**
 * Whether the customer may review the product (I-11): a completed purchase is required and one
 * review per product is allowed. A missing purchase is reported before a duplicate.
 */
export function decideEligibility(input: {
  completedItemId: string | null;
  alreadyReviewed: boolean;
}): Eligibility {
  if (input.completedItemId === null) {
    return { eligible: false, reason: 'NOT_PURCHASED' };
  }
  if (input.alreadyReviewed) {
    return { eligible: false, reason: 'ALREADY_REVIEWED' };
  }
  return { eligible: true, reason: null };
}
