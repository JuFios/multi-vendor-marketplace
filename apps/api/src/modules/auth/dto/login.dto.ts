import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MAX_LENGTH } from '../password-policy';

import { EMAIL_MAX_LENGTH, NormalizedEmail } from './register.dto';

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: EMAIL_MAX_LENGTH })
  @NormalizedEmail()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  @ApiProperty({ maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
