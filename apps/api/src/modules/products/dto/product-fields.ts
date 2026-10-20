import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators/sanitize-text.decorator';
import { PRODUCT_IMAGE_URL_MAX_LENGTH, PRODUCT_MAX_IMAGES } from '../product';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Free text typed by a seller: markup is stripped, whitespace trimmed, emptiness rejected. */
export function ProductText(maxLength: number): PropertyDecorator {
  return applyDecorators(
    SanitizeText(),
    Transform(trim),
    IsString(),
    MinLength(1),
    MaxLength(maxLength),
  );
}

/** Image links only (no uploads, I-17); http(s) so a `javascript:` URL cannot get through. */
export function ProductImages(): PropertyDecorator {
  return applyDecorators(
    IsArray(),
    ArrayMaxSize(PRODUCT_MAX_IMAGES),
    IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true }),
    MaxLength(PRODUCT_IMAGE_URL_MAX_LENGTH, { each: true }),
  );
}
