import { ApiProperty } from '@nestjs/swagger';

import type { AuthSession } from '../session.service';

import { SessionUserDto } from './session-user.dto';

export class SessionResponseDto {
  @ApiProperty({ description: 'Short-lived JWT; send it as `Authorization: Bearer <token>`.' })
  accessToken: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType: 'Bearer';

  @ApiProperty({ description: 'Access token lifetime in seconds.' })
  expiresIn: number;

  @ApiProperty({ type: SessionUserDto })
  user: SessionUserDto;

  static from(session: AuthSession): SessionResponseDto {
    return {
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: session.expiresInSec,
      user: SessionUserDto.from(session.user),
    };
  }
}
