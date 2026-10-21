import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password-policy';

import { IsAcceptablePassword } from './is-acceptable-password.decorator';

export class SetPasswordDto {
  @ApiPropertyOptional({
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Required when the account already has a password.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword?: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsAcceptablePassword()
  newPassword: string;
}
