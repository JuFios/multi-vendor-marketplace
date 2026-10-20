import { ConflictError, ForbiddenError } from '../../common/exceptions/app-error';

export class ReviewNotAllowedError extends ForbiddenError {
  constructor() {
    super(
      'Only customers with a completed purchase of this product can review it',
      'REVIEW_NOT_ALLOWED',
    );
  }
}

export class ReviewAlreadyExistsError extends ConflictError {
  constructor() {
    super('You have already reviewed this product', 'REVIEW_ALREADY_EXISTS');
  }
}
