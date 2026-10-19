import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators';
import { REJECTION_REASON_MAX_LENGTH } from '../moderation';

export class RejectApplicationDto {
  @ApiProperty({ minLength: 1, maxLength: REJECTION_REASON_MAX_LENGTH })
  @SanitizeText()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(REJECTION_REASON_MAX_LENGTH)
  reason: string;
}
