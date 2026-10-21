import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/exceptions/app-error';

export class CartItemNotFoundError extends NotFoundError {
  constructor() {
    super('The product is not in the cart', 'CART_ITEM_NOT_FOUND');
  }
}

export class CannotBuyOwnProductError extends AppError {
  constructor() {
    super('CANNOT_BUY_OWN_PRODUCT', 422, 'You cannot buy your own product');
  }
}

export class AuctionNotWonError extends ForbiddenError {
  constructor() {
    super('Only the winner can add an auction lot, within the checkout window', 'AUCTION_NOT_WON');
  }
}

export class CartInsufficientStockError extends ConflictError {
  constructor(stock: number) {
    super('Not enough stock for the requested quantity', 'INSUFFICIENT_STOCK', { stock });
  }
}

export class CartQuantityLimitError extends AppError {
  constructor(limit: number) {
    super('CART_QUANTITY_LIMIT', 422, `A cart line holds at most ${limit} units`);
  }
}

export class CartLineTotalLimitError extends AppError {
  constructor(limit: number) {
    super('CART_LINE_TOTAL_LIMIT', 422, `A cart line cannot cost more than ${limit} cents`);
  }
}
