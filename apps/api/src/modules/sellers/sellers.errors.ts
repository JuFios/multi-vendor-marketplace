import { ConflictError, NotFoundError } from '../../common/exceptions/app-error';

export class SellerApplicationExistsError extends ConflictError {
  constructor() {
    super('You have already applied to become a seller', 'SELLER_APPLICATION_EXISTS');
  }
}

export class StoreNameTakenError extends ConflictError {
  constructor() {
    super('This store name is already taken', 'STORE_NAME_TAKEN');
  }
}

export class SellerApplicationNotFoundError extends NotFoundError {
  constructor() {
    super('Seller application not found', 'SELLER_APPLICATION_NOT_FOUND');
  }
}

export class SellerNotFoundError extends NotFoundError {
  constructor() {
    super('Seller not found', 'SELLER_NOT_FOUND');
  }
}

export class SellerApplicationNotPendingError extends ConflictError {
  constructor() {
    super('This application has already been decided', 'SELLER_APPLICATION_NOT_PENDING');
  }
}
