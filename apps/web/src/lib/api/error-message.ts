import { isApiError } from './errors';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  TOO_MANY_REQUESTS: 'Too many attempts. Please wait a moment and try again.',
};

export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 429) {
      return MESSAGES.TOO_MANY_REQUESTS!;
    }
    return MESSAGES[error.code] ?? error.message;
  }
  return 'Something went wrong. Please try again.';
}
