import { ApiProperty } from '@nestjs/swagger';

import { ROLES, type UserAccount, type UserRole } from '../../users';

/** The signed-in user as the sign-in endpoints describe them. */
export class SessionUserDto {
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

  static from(user: UserAccount): SessionUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: [...user.roles],
      emailVerified: user.emailVerified,
    };
  }
}
