import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

import { ErrorResponseDto } from './error-response.dto';

const DESCRIPTION: Readonly<Record<number, string>> = {
  400: 'Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST).',
  401: 'Missing or invalid credentials (UNAUTHORIZED).',
  403: 'Authenticated but not allowed (FORBIDDEN).',
  404: 'Resource not found, or not visible to the caller (NOT_FOUND).',
  409: 'Conflicts with the current state (CONFLICT).',
  422: 'The Idempotency-Key was already used with a different request (IDEMPOTENCY_KEY_REUSED).',
  429: 'Rate limit exceeded (RATE_LIMITED).',
  500: 'Unexpected failure (INTERNAL_ERROR).',
  503: 'A required dependency is unavailable (DEPENDENCY_UNAVAILABLE).',
};

export const STANDARD_ERROR_STATUSES = [400, 401, 403, 404, 409, 429, 500, 503] as const;

/** Documents the shared error body for the given statuses (all standard ones by default). */
export function ApiErrorResponses(
  ...statuses: readonly number[]
): MethodDecorator & ClassDecorator {
  const documented = statuses.length > 0 ? statuses : STANDARD_ERROR_STATUSES;
  return applyDecorators(
    ...documented.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTION[status] ?? 'Error',
        type: ErrorResponseDto,
      }),
    ),
  );
}
