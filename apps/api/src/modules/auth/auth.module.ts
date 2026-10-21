import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { authConfig } from '../../config/auth.config';
import { SellersModule } from '../sellers/sellers.module';
import { UsersModule } from '../users/users.module';

import { ACCESS_TOKEN_ALGORITHM } from './access-claims';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { GoogleCallbackFilter } from './google-callback.filter';
import { GoogleCallbackGuard, GoogleEnabledGuard, GoogleLoginGuard } from './guards/google.guards';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordHasher } from './password-hasher.service';
import { PasswordController } from './password.controller';
import { SessionService } from './session.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  controllers: [AuthController, PasswordController],
  imports: [
    PassportModule,
    UsersModule,
    SellersModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.accessSecret,
        signOptions: { algorithm: ACCESS_TOKEN_ALGORITHM, expiresIn: config.accessTtlSec },
        verifyOptions: { algorithms: [ACCESS_TOKEN_ALGORITHM] },
      }),
    }),
  ],
  providers: [
    PasswordHasher,
    AccessTokenService,
    SessionService,
    AuthService,
    AuthRepository,
    JwtStrategy,
    // Built only when Google credentials exist; the strategy cannot be constructed without them.
    {
      provide: GoogleStrategy,
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) =>
        config.google ? new GoogleStrategy(config.google) : null,
    },
    GoogleEnabledGuard,
    GoogleLoginGuard,
    GoogleCallbackGuard,
    GoogleCallbackFilter,
    // Order matters: authentication must run before the role check reads `request.user`.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AccessTokenService],
})
export class AuthModule {}
