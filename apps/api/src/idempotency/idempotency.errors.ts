import { AppError } from '../common/exceptions';

export const IDEMPOTENCY_ERROR_CODE = {
  KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  OUTSIDE_TRANSACTION: 'IDEMPOTENCY_OUTSIDE_TRANSACTION',
} as const;

export class IdempotencyKeyRequiredError extends AppError {
  constructor() {
    super(
      IDEMPOTENCY_ERROR_CODE.KEY_REQUIRED,
      400,
      'The Idempotency-Key header is required and must be a UUID',
    );
  }
}

export class IdempotencyKeyReusedError extends AppError {
  constructor() {
    super(
      IDEMPOTENCY_ERROR_CODE.KEY_REUSED,
      422,
      'This Idempotency-Key was already used with a different request',
    );
  }
}

export class IdempotencyInProgressError extends AppError {
  constructor(message = 'A request with this Idempotency-Key is still being processed') {
    super(IDEMPOTENCY_ERROR_CODE.IN_PROGRESS, 409, message);
  }
}

/** A programming error: the response must be recorded in the transaction that makes the effect. */
export class IdempotencyOutsideTransactionError extends AppError {
  constructor() {
    super(
      IDEMPOTENCY_ERROR_CODE.OUTSIDE_TRANSACTION,
      500,
      'IdempotencyService.complete must run inside the transaction of the operation',
    );
  }
}
