import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators';
import { normalizeEmail } from '../../users/email';
import { USER_NAME_MAX_LENGTH } from '../../users/user-account';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password-policy';

import { IsAcceptablePassword } from './is-acceptable-password.decorator';

export const EMAIL_MAX_LENGTH = 254;

export const NormalizedEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );

export class RegisterDto {
  @ApiProperty({ format: 'email', maxLength: EMAIL_MAX_LENGTH })
  @NormalizedEmail()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'At least one letter and one digit.',
  })
  @IsString()
  @IsAcceptablePassword()
  password: string;

  @ApiProperty({ minLength: 1, maxLength: USER_NAME_MAX_LENGTH })
  @SanitizeText()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(USER_NAME_MAX_LENGTH)
  name: string;
}
