import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators/sanitize-text.decorator';
import { REVIEW_RATING_MAX, REVIEW_RATING_MIN, REVIEW_TEXT_MAX_LENGTH } from '../reviews.constants';

export class CreateReviewDto {
  @ApiProperty({ minimum: REVIEW_RATING_MIN, maximum: REVIEW_RATING_MAX })
  @IsInt()
  @Min(REVIEW_RATING_MIN)
  @Max(REVIEW_RATING_MAX)
  rating: number;

  @ApiProperty({ minLength: 1, maxLength: REVIEW_TEXT_MAX_LENGTH })
  @SanitizeText()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_TEXT_MAX_LENGTH)
  text: string;
}
