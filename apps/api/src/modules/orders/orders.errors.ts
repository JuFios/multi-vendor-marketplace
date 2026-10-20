import { AppError, ConflictError, NotFoundError } from '../../common/exceptions/app-error';

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

export type CheckoutProblemReason = 'UNAVAILABLE' | 'INSUFFICIENT_STOCK' | 'AUCTION_NOT_SUPPORTED';

export interface CheckoutProblem {
  readonly productId: string;
  readonly reason: CheckoutProblemReason;
}

export class CartItemsUnavailableError extends ConflictError {
  constructor(items: readonly CheckoutProblem[]) {
    super('Some items in the cart cannot be bought', 'CART_ITEMS_UNAVAILABLE', { items });
  }
}

export class OrderNotFoundError extends NotFoundError {
  constructor() {
    super('Order not found', 'ORDER_NOT_FOUND');
  }
}

export class SellerOrderNotFoundError extends NotFoundError {
  constructor() {
    super('Seller order not found', 'SELLER_ORDER_NOT_FOUND');
  }
}
