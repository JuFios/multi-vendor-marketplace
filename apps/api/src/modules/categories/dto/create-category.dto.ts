import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators';
import {
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_SLUG_MAX_LENGTH,
  CATEGORY_SLUG_PATTERN,
} from '../category';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  @ApiProperty({ minLength: 1, maxLength: CATEGORY_NAME_MAX_LENGTH })
  @SanitizeText()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CATEGORY_NAME_MAX_LENGTH)
  name: string;

  @ApiProperty({
    maxLength: CATEGORY_SLUG_MAX_LENGTH,
    example: 'home-garden',
    description: 'Unique, lower-case words joined by hyphens.',
  })
  @IsString()
  @MaxLength(CATEGORY_SLUG_MAX_LENGTH)
  @Matches(CATEGORY_SLUG_PATTERN)
  slug: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
