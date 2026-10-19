import { ERROR_CODE } from './error-codes';

/** Base of every deliberate failure; the exception filter renders it as the API error body. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationFailedError extends AppError {
  constructor(details: unknown, message = 'Request validation failed') {
    super(ERROR_CODE.VALIDATION_FAILED, 400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required', code: string = ERROR_CODE.UNAUTHORIZED) {
    super(code, 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to do this', code: string = ERROR_CODE.FORBIDDEN) {
    super(code, 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code: string = ERROR_CODE.NOT_FOUND) {
    super(code, 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(
    message = 'Resource conflict',
    code: string = ERROR_CODE.CONFLICT,
    details?: unknown,
  ) {
    super(code, 409, message, details);
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(message = 'A required dependency is temporarily unavailable') {
    super(ERROR_CODE.DEPENDENCY_UNAVAILABLE, 503, message);
  }
}
