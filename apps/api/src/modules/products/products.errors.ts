import { AppError, ConflictError, NotFoundError } from '../../common/exceptions/app-error';

export class ProductNotFoundError extends NotFoundError {
  constructor() {
    super('Product not found', 'PRODUCT_NOT_FOUND');
  }
}

export class ProductCategoryInvalidError extends AppError {
  constructor() {
    super('PRODUCT_CATEGORY_INVALID', 400, 'The category does not exist');
  }
}

export class FixedPriceOnlyError extends AppError {
  constructor() {
    super(
      'PRODUCT_NOT_FIXED_PRICE',
      400,
      'Price and stock are only editable on fixed-price products',
    );
  }
}

export class ProductNotPendingError extends ConflictError {
  constructor() {
    super('This product is not awaiting moderation', 'PRODUCT_NOT_PENDING');
  }
}

/** The stock moved (a sale, a cancellation) since the value a stock change was decided on. */
export class ProductStockConflictError extends ConflictError {
  constructor(current: { stock: number }) {
    super(
      'The stock changed since you loaded it; check the current stock and try again',
      'PRODUCT_STOCK_CONFLICT',
      current,
    );
  }
}

export class InsufficientStockError extends ConflictError {
  constructor(items: readonly { productId: string; requested: number; available: number }[]) {
    super('Not enough stock for some of the products', 'INSUFFICIENT_STOCK', { items });
  }
}
