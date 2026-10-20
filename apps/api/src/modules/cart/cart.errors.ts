import { AppError, ConflictError, NotFoundError } from '../../common/exceptions/app-error';

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

export class CartProductNotFixedPriceError extends AppError {
  constructor() {
    super('PRODUCT_NOT_FIXED_PRICE', 400, 'Only fixed-price products can be added to the cart');
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
