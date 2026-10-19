export const REJECTION_REASON_MAX_LENGTH = 500;

export type ModerationDecision =
  { readonly status: 'APPROVED' } | { readonly status: 'REJECTED'; readonly reason: string };
