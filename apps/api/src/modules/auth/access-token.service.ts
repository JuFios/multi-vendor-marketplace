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

export interface VerifiedAccessToken {
  readonly user: AuthUser;
  readonly expiresAt: Date;
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async issue(claims: Omit<AccessTokenClaims, 'iat'>): Promise<IssuedAccessToken> {
    const payload = {
      roles: claims.roles,
      ...(claims.sellerId === undefined ? {} : { sellerId: claims.sellerId }),
    };
    const token = await this.jwt.signAsync(payload, { subject: claims.sub });
    return { token, expiresInSec: this.config.accessTtlSec };
  }

  /** The caller behind a token and when it lapses, or null when malformed, forged or expired. */
  async verify(token: string): Promise<VerifiedAccessToken | null> {
    try {
      const claims = await this.jwt.verifyAsync<Partial<AccessTokenClaims> & { exp?: number }>(
        token,
      );
      const user = authUserFromClaims(claims);
      if (user === null || typeof claims.exp !== 'number') {
        return null;
      }
      return { user, expiresAt: new Date(claims.exp * 1000) };
    } catch {
      // Every failure (bad signature, expiry, wrong shape) means the same to the caller: no user.
      return null;
    }
  }
}
