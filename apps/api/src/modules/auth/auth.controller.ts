import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { AppError, ForbiddenError } from '../../common/exceptions/app-error';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { REFRESH_COOKIE_AUTH, REFRESH_COOKIE_NAME } from '../../common/swagger/openapi';
import { RateLimit } from '../../common/throttling/rate-limit.decorator';
import { THROTTLER } from '../../common/throttling/throttler-names';
import { authConfig } from '../../config/auth.config';
import { httpConfig } from '../../config/http.config';

import { InvalidRefreshTokenError } from './auth.errors';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ProvidersResponseDto } from './dto/providers-response.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { GoogleCallbackFilter } from './google-callback.filter';
import type { GoogleProfile } from './google-login';
import { GoogleCallbackGuard, GoogleEnabledGuard, GoogleLoginGuard } from './guards/google.guards';
import { clearRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { type AuthSession, type ClientContext, SessionService } from './session.service';

const clientOf = (req: Request): ClientContext => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

const refreshTokenOf = (req: Request): string | undefined => {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
    @Inject(httpConfig.KEY) private readonly http: ConfigType<typeof httpConfig>,
  ) {}

  @Post('register')
  @RateLimit(THROTTLER.REGISTER)
  @ApiOperation({
    summary: 'Create a customer account and sign in.',
    description:
      'Returns the access token in the body and sets the refresh token in the httpOnly `rt` cookie.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: SessionResponseDto })
  @ApiErrorResponses(400, 409, 429)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    return this.respondWith(res, await this.auth.register(dto, clientOf(req)));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(THROTTLER.LOGIN)
  @RateLimit(THROTTLER.LOGIN_EMAIL)
  @ApiOperation({
    summary: 'Sign in with email and password.',
    description:
      'Rate limited per client address and per account. An unknown email and a wrong password ' +
      'produce the same response.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiErrorResponses(400, 401, 429)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    return this.respondWith(res, await this.auth.login(dto, clientOf(req)));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit(THROTTLER.REFRESH)
  @ApiOperation({
    summary: 'Exchange the refresh cookie for a new access token.',
    description:
      'Rotates the refresh token. Presenting a token that was already rotated revokes the whole ' +
      'session family. Requires the `X-Requested-With` header as an extra CSRF guard.',
  })
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiHeader({ name: 'X-Requested-With', required: true, example: 'XMLHttpRequest' })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiErrorResponses(401, 403, 429)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-requested-with') requestedWith: string | undefined,
  ): Promise<SessionResponseDto> {
    if (!requestedWith) {
      throw new ForbiddenError('The X-Requested-With header is required', 'CSRF_HEADER_REQUIRED');
    }
    const token = refreshTokenOf(req);
    if (token === undefined) {
      this.dropCookie(res);
      throw new InvalidRefreshTokenError();
    }
    try {
      return this.respondWith(res, await this.sessions.refresh(token, clientOf(req)));
    } catch (error) {
      if (error instanceof AppError) {
        this.dropCookie(res);
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the session: revokes the refresh-token family and clears the cookie.',
    description: 'Always succeeds, also when the cookie is missing or already revoked.',
  })
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiNoContentResponse()
  @ApiErrorResponses(429, 500)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = refreshTokenOf(req);
    if (token !== undefined) {
      await this.sessions.end(token);
    }
    this.dropCookie(res);
  }

  @Get('providers')
  @ApiOperation({ summary: 'Sign-in methods the frontend may offer.' })
  @ApiOkResponse({ type: ProvidersResponseDto })
  @ApiErrorResponses(429, 500)
  providers(): ProvidersResponseDto {
    return { google: this.config.google !== null };
  }

  @Get('google')
  @UseGuards(GoogleEnabledGuard, GoogleLoginGuard)
  @ApiOperation({
    summary: 'Start Google sign-in: redirects the browser to Google.',
    description: 'Answers 503 PROVIDER_DISABLED while Google credentials are not configured.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google.' })
  @ApiErrorResponses(503)
  googleLogin(): void {
    // The guard redirects; this handler is never reached.
  }

  @Get('google/callback')
  @UseGuards(GoogleEnabledGuard, GoogleCallbackGuard)
  @UseFilters(GoogleCallbackFilter)
  @ApiOperation({
    summary: 'Google redirects here after consent.',
    description:
      'Signs the user in (creating or linking the account) and sets the refresh cookie, then ' +
      'redirects to `${WEB_URL}/auth/callback` without any token in the URL; the SPA then calls ' +
      '`POST /api/auth/refresh`. A failure redirects to the same page with `?error=<CODE>`.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the SPA.' })
  @ApiErrorResponses(503)
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const session = await this.auth.loginWithGoogle(req.user as GoogleProfile, clientOf(req));
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, this.config.cookieSecure);
    res.redirect(302, new URL('/auth/callback', this.http.webOrigin).toString());
  }

  private dropCookie(res: Response): void {
    clearRefreshCookie(res, this.config.cookieSecure);
  }

  private respondWith(res: Response, session: AuthSession): SessionResponseDto {
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, this.config.cookieSecure);
    return SessionResponseDto.from(session);
  }
}
