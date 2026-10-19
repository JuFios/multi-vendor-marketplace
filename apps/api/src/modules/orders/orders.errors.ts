import { AppError, ConflictError } from '../../common/exceptions';

export class InvalidStatusTransitionError extends ConflictError {
  constructor(from: string, to: string) {
    super(`A seller order cannot go from ${from} to ${to}`, 'INVALID_STATUS_TRANSITION', {
      from,
      to,
    });
  }
}

export class PaymentNotCapturedError extends ConflictError {
  constructor() {
    super('The payment for this seller order has not been captured', 'PAYMENT_NOT_CAPTURED');
  }
}

export class CartEmptyError extends AppError {
  constructor() {
    super('CART_EMPTY', 400, 'The cart has no items');
  }
}
