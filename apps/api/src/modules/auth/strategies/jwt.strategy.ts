import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { authConfig } from '../../../config/auth.config';
import { ACCESS_TOKEN_ALGORITHM, type AccessTokenClaims } from '../access-claims';
import { authUserFromClaims, type AuthUser } from '../auth-user';
import { JWT_STRATEGY_NAME } from '../auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(@Inject(authConfig.KEY) config: ConfigType<typeof authConfig>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.accessSecret,
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      ignoreExpiration: false,
    });
  }

  /** Roles come from the token: they may lag behind the database until the next refresh. */
  validate(claims: Partial<AccessTokenClaims>): AuthUser | false {
    return authUserFromClaims(claims) ?? false;
  }
}
