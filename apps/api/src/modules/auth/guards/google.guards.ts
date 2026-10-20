import { randomBytes } from 'node:crypto';

import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { CookieOptions, Request, Response } from 'express';

import { authConfig } from '../../../config/auth.config';
import { GOOGLE_STATE_COOKIE, GOOGLE_STRATEGY_NAME } from '../auth.constants';
import { GoogleAuthFailedError, ProviderDisabledError } from '../auth.errors';

const STATE_TTL_MS = 10 * 60 * 1000;

const stateCookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/api/auth/google',
});

/** Both Google routes answer 503 until credentials are configured. */
@Injectable()
export class GoogleEnabledGuard implements CanActivate {
  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

  canActivate(): boolean {
    if (this.config.google === null) {
      throw new ProviderDisabledError();
    }
    return true;
  }
}

/**
 * Starts the flow: remembers a random `state` in a short-lived cookie and redirects to Google.
 * The callback accepts the return only when Google echoes the same value, which ties the
 * response to the browser that began the flow.
 */
@Injectable()
export class GoogleLoginGuard extends AuthGuard(GOOGLE_STRATEGY_NAME) {
  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {
    super();
  }

  override getAuthenticateOptions(context: ExecutionContext) {
    const state = randomBytes(16).toString('base64url');
    context
      .switchToHttp()
      .getResponse<Response>()
      .cookie(GOOGLE_STATE_COOKIE, state, {
        ...stateCookieOptions(this.config.cookieSecure),
        maxAge: STATE_TTL_MS,
      });
    return { session: false, state };
  }
}

@Injectable()
export class GoogleCallbackGuard extends AuthGuard(GOOGLE_STRATEGY_NAME) {
  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const expected = (req.cookies as Record<string, unknown> | undefined)?.[GOOGLE_STATE_COOKIE];
    // One attempt per state, whatever the outcome.
    http
      .getResponse<Response>()
      .clearCookie(GOOGLE_STATE_COOKIE, stateCookieOptions(this.config.cookieSecure));

    const received = req.query.state;
    if (typeof expected !== 'string' || expected === '' || received !== expected) {
      throw new GoogleAuthFailedError();
    }
    return (await super.canActivate(context)) as boolean;
  }

  override getAuthenticateOptions() {
    return { session: false };
  }

  override handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new GoogleAuthFailedError();
    }
    return user;
  }
}
