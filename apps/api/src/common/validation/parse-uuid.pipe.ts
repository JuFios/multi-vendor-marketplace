import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { ValidationFailedError } from '../errors';

/** Route-param guard that fails with the same VALIDATION_FAILED shape as body validation. */
@Injectable()
export class ParseUuidPipe implements PipeTransform<unknown, string> {
  transform(value: unknown, metadata: ArgumentMetadata): string {
    if (typeof value === 'string' && isUUID(value)) {
      return value;
    }
    const field = metadata.data ?? 'id';
    throw new ValidationFailedError([{ field, messages: [`${field} must be a UUID`] }]);
  }
}
