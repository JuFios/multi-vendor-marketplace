import { AppError, ForbiddenError, UnauthorizedError } from '../../common/exceptions/app-error';

/** Deliberately the same for an unknown email and a wrong password. */
export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS');
  }
}

export class InvalidRefreshTokenError extends UnauthorizedError {
  constructor() {
    super('The refresh token is missing, invalid or expired', 'INVALID_REFRESH_TOKEN');
  }
}

/** The family was revoked: the user has to sign in again. */
export class RefreshTokenReusedError extends UnauthorizedError {
  constructor() {
    super('The refresh token was already used; sign in again', 'REFRESH_TOKEN_REUSED');
  }
}

/** Setting a first password needs a session opened after Google proved the mailbox. */
export class FreshSignInRequiredError extends ForbiddenError {
  constructor() {
    super('Sign in with Google again to set a password', 'FRESH_SIGN_IN_REQUIRED');
  }
}

export class ProviderDisabledError extends AppError {
  constructor() {
    super('PROVIDER_DISABLED', 503, 'Google sign-in is not configured');
  }
}

/** Failures of the Google callback; the browser is sent back to the SPA with the code, not shown JSON. */
export class GoogleLoginFailedError extends AppError {}

export class GoogleEmailNotVerifiedError extends GoogleLoginFailedError {
  constructor() {
    super('GOOGLE_EMAIL_NOT_VERIFIED', 403, 'Google has not verified this email address');
  }
}

export class GoogleAuthFailedError extends GoogleLoginFailedError {
  constructor() {
    super('GOOGLE_AUTH_FAILED', 401, 'Google sign-in was cancelled or failed');
  }
}
