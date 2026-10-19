import { ConflictError, NotFoundError } from '../../common/exceptions';

export class EmailAlreadyRegisteredError extends ConflictError {
  constructor() {
    super('An account with this email already exists', 'EMAIL_ALREADY_REGISTERED');
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('User not found', 'USER_NOT_FOUND');
  }
}
