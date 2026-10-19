import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators';

export const CANCEL_REASON_MAX_LENGTH = 500;

export class CancelSellerOrderDto {
  @ApiProperty({ minLength: 1, maxLength: CANCEL_REASON_MAX_LENGTH })
  @SanitizeText()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(CANCEL_REASON_MAX_LENGTH)
  reason: string;
}
