import { type ArgumentsHost, Catch, type ExceptionFilter, Inject, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import type { Response } from 'express';

import { httpConfig } from '../../config';

import { GoogleLoginFailedError } from './auth.errors';

/** The callback is a browser navigation, so a failure sends the user back to the SPA with a code. */
@Catch(GoogleLoginFailedError)
export class GoogleCallbackFilter implements ExceptionFilter<GoogleLoginFailedError> {
  private readonly logger = new Logger(GoogleCallbackFilter.name);

  constructor(@Inject(httpConfig.KEY) private readonly config: ConfigType<typeof httpConfig>) {}

  catch(error: GoogleLoginFailedError, host: ArgumentsHost): void {
    this.logger.warn({ msg: 'auth.google.failure', code: error.code });
    const target = new URL('/auth/callback', this.config.webOrigin);
    target.searchParams.set('error', error.code);
    host.switchToHttp().getResponse<Response>().redirect(302, target.toString());
  }
}
