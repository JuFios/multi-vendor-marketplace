export const SELLER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const STORE_NAME_MIN_LENGTH = 2;
export const STORE_NAME_MAX_LENGTH = 100;
export const STORE_DESCRIPTION_MAX_LENGTH = 2000;

/** A user's one store profile; it is an application until an admin approves it. */
export interface SellerApplication {
  readonly id: string;
  readonly userId: string;
  readonly storeName: string;
  readonly description: string | null;
  readonly status: SellerStatus;
  readonly rejectionReason: string | null;
  readonly moderatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApplicationInput {
  readonly storeName: string;
  readonly description: string | null;
}

export type ApplyDecision =
  | { readonly kind: 'create' }
  | { readonly kind: 'resubmit'; readonly applicationId: string }
  | { readonly kind: 'duplicate' };

/** One profile per user: only a rejected application may be submitted again. */
export function decideApplication(
  existing: Pick<SellerApplication, 'id' | 'status'> | null,
): ApplyDecision {
  if (existing === null) {
    return { kind: 'create' };
  }
  return existing.status === 'REJECTED'
    ? { kind: 'resubmit', applicationId: existing.id }
    : { kind: 'duplicate' };
}
