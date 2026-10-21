import { ApiProperty } from '@nestjs/swagger';

import type { UserProfile } from '../user-account';
import { ROLES, type UserRole } from '../user-role';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ROLES, isArray: true })
  roles: UserRole[];

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({
    description:
      'Whether email and password sign-in works. False for an account created through Google, ' +
      'or one whose password was cleared when Google was linked; `POST /api/users/me/password` ' +
      'sets one.',
  })
  hasPassword: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(user: UserProfile): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: [...user.roles],
      emailVerified: user.emailVerified,
      hasPassword: user.hasPassword,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
