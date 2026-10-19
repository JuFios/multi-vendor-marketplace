import { AppError } from '../../common/exceptions';

import type { SellerOrderStatusValue as S } from './order-status';
import {
  type Actor,
  assertTransition,
  type PaymentStatusValue,
} from './seller-order-state-machine';

const STATUSES: S[] = ['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
const ACTORS: Actor[] = ['CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM'];

const ALLOWED: Record<string, Actor[]> = {
  'NEW>PROCESSING': ['SELLER'],
  'PROCESSING>SHIPPED': ['SELLER'],
  'SHIPPED>COMPLETED': ['CUSTOMER', 'ADMIN'],
  'NEW>CANCELLED': ['CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM'],
  'PROCESSING>CANCELLED': ['SELLER', 'ADMIN'],
  'SHIPPED>CANCELLED': ['ADMIN'],
  'COMPLETED>CANCELLED': ['ADMIN'],
};

const passes = (
  from: S,
  to: S,
  actor: Actor,
  payment: PaymentStatusValue = 'CAPTURED',
): boolean => {
  try {
    assertTransition(from, to, actor, { paymentStatus: payment, viaDispute: true });
    return true;
  } catch (error) {
    if (error instanceof AppError) {
      return false;
    }
    throw error;
  }
};

const codeOfFailure = (action: () => void): string | undefined => {
  try {
    action();
  } catch (error) {
    return error instanceof AppError ? error.code : 'UNEXPECTED';
  }
  return undefined;
};

describe('assertTransition', () => {
  it.each(STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const)))(
    '%s -> %s is allowed exactly for the listed actors',
    (from, to) => {
      const allowed = ALLOWED[`${from}>${to}`] ?? [];
      expect(ACTORS.filter((actor) => passes(from, to, actor))).toEqual(
        ACTORS.filter((actor) => allowed.includes(actor)),
      );
    },
  );

  it('starts processing only once the payment is captured', () => {
    for (const payment of ['PENDING', 'FAILED', 'REFUNDED'] as const) {
      expect(
        codeOfFailure(() =>
          assertTransition('NEW', 'PROCESSING', 'SELLER', { paymentStatus: payment }),
        ),
      ).toBe('PAYMENT_NOT_CAPTURED');
    }
  });

  it('cancels a shipped or completed seller order only through a dispute', () => {
    for (const from of ['SHIPPED', 'COMPLETED'] as const) {
      expect(
        codeOfFailure(() =>
          assertTransition(from, 'CANCELLED', 'ADMIN', { paymentStatus: 'CAPTURED' }),
        ),
      ).toBe('INVALID_STATUS_TRANSITION');
      expect(() =>
        assertTransition(from, 'CANCELLED', 'ADMIN', {
          paymentStatus: 'CAPTURED',
          viaDispute: true,
        }),
      ).not.toThrow();
    }
  });

  it('refuses to leave a final state', () => {
    for (const to of STATUSES) {
      expect(
        codeOfFailure(() =>
          assertTransition('CANCELLED', to, 'ADMIN', {
            paymentStatus: 'CAPTURED',
            viaDispute: true,
          }),
        ),
      ).toBe('INVALID_STATUS_TRANSITION');
    }
  });
});
