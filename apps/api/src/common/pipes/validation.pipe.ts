import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import { ValidationFailedError } from '../exceptions';

export interface ValidationIssue {
  field: string;
  messages: string[];
}

/** Flattens nested class-validator errors into one entry per failing field path. */
export function toValidationIssues(
  errors: readonly ValidationError[],
  parent = '',
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = parent === '' ? error.property : `${parent}.${error.property}`;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...toValidationIssues(error.children ?? [], field)];
  });
}

/** Unknown properties are rejected, not silently dropped, so typos in a payload surface as errors. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationFailedError(toValidationIssues(errors)),
  });
}
