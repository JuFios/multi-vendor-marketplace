import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { authConfig } from '../../config/auth.config';

import type { AccessTokenClaims } from './access-claims';
import { authUserFromClaims, type AuthUser } from './auth-user';

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresInSec: number;
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const payload = {
      roles: claims.roles,
      ...(claims.sellerId === undefined ? {} : { sellerId: claims.sellerId }),
    };
    const token = await this.jwt.signAsync(payload, { subject: claims.sub });
    return { token, expiresInSec: this.config.accessTtlSec };
  }

  /** The caller behind a token, or null when it is malformed, forged or expired. */
  async verify(token: string): Promise<AuthUser | null> {
    try {
      return authUserFromClaims(await this.jwt.verifyAsync<Partial<AccessTokenClaims>>(token));
    } catch {
      // Every failure (bad signature, expiry, wrong shape) means the same to the caller: no user.
      return null;
    }
  }
}
