import { ApiProperty } from '@nestjs/swagger';

import type { UserAccount } from '../user-account';
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

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(user: UserAccount): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: [...user.roles],
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
