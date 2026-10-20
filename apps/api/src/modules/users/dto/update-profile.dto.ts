import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators/sanitize-text.decorator';
import { USER_NAME_MAX_LENGTH } from '../user-account';

export class UpdateProfileDto {
  @ApiProperty({ minLength: 1, maxLength: USER_NAME_MAX_LENGTH })
  @SanitizeText()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(USER_NAME_MAX_LENGTH)
  name: string;
}
