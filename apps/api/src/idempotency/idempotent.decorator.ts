import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENT_SCOPE_METADATA,
  type IdempotencyScope,
} from './idempotency.constants';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Makes a route safe to retry: it requires an `Idempotency-Key` header, replays the recorded
 * response for a repeated request and rejects a reused key with a different body. The use case
 * must call `IdempotencyService.complete(body)` at the end of its transaction.
 */
export const Idempotent = (scope: IdempotencyScope): MethodDecorator =>
  applyDecorators(
    SetMetadata(IDEMPOTENT_SCOPE_METADATA, scope),
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: IDEMPOTENCY_HEADER,
      required: true,
      description: 'UUID chosen by the client; repeat it to retry the same request safely.',
    }),
  );
