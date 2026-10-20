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

export class AuctionProductsNotSupportedError extends AppError {
  constructor() {
    super('NOT_SUPPORTED_YET', 400, 'Auction products cannot be created yet');
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

export class InsufficientStockError extends ConflictError {
  constructor(items: readonly { productId: string; requested: number; available: number }[]) {
    super('Not enough stock for some of the products', 'INSUFFICIENT_STOCK', { items });
  }
}
