import { AppError, NotFoundError } from '../../common/exceptions';

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
