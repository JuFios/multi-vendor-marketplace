import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators';
import {
  STORE_DESCRIPTION_MAX_LENGTH,
  STORE_NAME_MAX_LENGTH,
  STORE_NAME_MIN_LENGTH,
} from '../seller-application';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ApplyForSellerDto {
  @ApiProperty({ minLength: STORE_NAME_MIN_LENGTH, maxLength: STORE_NAME_MAX_LENGTH })
  @SanitizeText()
  @Transform(trim)
  @IsString()
  @MinLength(STORE_NAME_MIN_LENGTH)
  @MaxLength(STORE_NAME_MAX_LENGTH)
  storeName: string;

  @ApiPropertyOptional({ maxLength: STORE_DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @SanitizeText()
  @Transform(trim)
  @IsString()
  @MaxLength(STORE_DESCRIPTION_MAX_LENGTH)
  description?: string;
}
