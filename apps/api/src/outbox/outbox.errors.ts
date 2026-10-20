import { AppError } from '../common/exceptions/app-error';

/** A programming error: events written outside the business transaction could be lost or phantom. */
export class OutboxOutsideTransactionError extends AppError {
  constructor() {
    super(
      'OUTBOX_OUTSIDE_TRANSACTION',
      500,
      'Outbox events must be added inside the transaction that changes the state',
    );
  }
}
