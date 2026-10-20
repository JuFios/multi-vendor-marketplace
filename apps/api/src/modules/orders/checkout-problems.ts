import type { CheckoutProblem } from './orders.errors';

export interface CheckoutLineState {
  readonly productId: string;
  readonly type: 'FIXED_PRICE' | 'AUCTION';
  readonly availability: 'AVAILABLE' | 'INSUFFICIENT_STOCK' | 'UNAVAILABLE';
}

/** Every line that cannot be bought as it is, so the buyer can fix the cart in one go. */
export function findCheckoutProblems(lines: readonly CheckoutLineState[]): CheckoutProblem[] {
  return lines.flatMap((line): CheckoutProblem[] => {
    if (line.availability === 'UNAVAILABLE') {
      return [{ productId: line.productId, reason: 'UNAVAILABLE' }];
    }
    return line.availability === 'INSUFFICIENT_STOCK'
      ? [{ productId: line.productId, reason: 'INSUFFICIENT_STOCK' }]
      : [];
  });
}
