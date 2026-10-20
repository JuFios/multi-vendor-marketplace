import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators/sanitize-text.decorator';
import {
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_SLUG_MAX_LENGTH,
  CATEGORY_SLUG_PATTERN,
} from '../category';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateCategoryDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: CATEGORY_NAME_MAX_LENGTH })
  @IsOptional()
  @SanitizeText()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CATEGORY_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ maxLength: CATEGORY_SLUG_MAX_LENGTH, example: 'home-garden' })
  @IsOptional()
  @IsString()
  @MaxLength(CATEGORY_SLUG_MAX_LENGTH)
  @Matches(CATEGORY_SLUG_PATTERN)
  slug?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'The new parent; `null` makes the category a root.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
