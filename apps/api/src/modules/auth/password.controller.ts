import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { RateLimit } from '../../common/throttling/rate-limit.decorator';
import { THROTTLER } from '../../common/throttling/throttler-names';

import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { SetPasswordDto } from './dto/set-password.dto';

/** Lives in `auth` beside the hasher; the path belongs to the user's own account. */
@ApiTags('users')
@ApiBearerAuth(BEARER_AUTH)
@Controller('users/me/password')
export class PasswordController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(THROTTLER.LOGIN)
  @ApiOperation({ summary: 'Set or change the password of the authenticated user.' })
  @ApiBody({ type: SetPasswordDto })
  @ApiNoContentResponse({ description: 'The password was set.' })
  @ApiErrorResponses(400, 401, 404, 429)
  async setPassword(@CurrentUser() user: AuthUser, @Body() dto: SetPasswordDto): Promise<void> {
    await this.auth.setPassword(user.userId, dto);
  }
}
