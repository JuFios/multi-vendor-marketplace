import { ConflictError, NotFoundError } from '../../common/exceptions/app-error';

export class DisputeNotFoundError extends NotFoundError {
  constructor() {
    super('Dispute not found', 'DISPUTE_NOT_FOUND');
  }
}

export class DisputeNotAllowedError extends ConflictError {
  constructor(status: string) {
    super(
      `A dispute cannot be opened for a seller order that is ${status}`,
      'DISPUTE_NOT_ALLOWED',
      {
        status,
      },
    );
  }
}

export class DisputeAlreadyOpenError extends ConflictError {
  constructor() {
    super('This seller order already has an open dispute', 'DISPUTE_ALREADY_OPEN');
  }
}

export class DisputeClosedError extends ConflictError {
  constructor() {
    super('This dispute is already resolved', 'DISPUTE_CLOSED');
  }
}
