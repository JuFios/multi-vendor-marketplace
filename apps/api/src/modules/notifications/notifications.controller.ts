import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationPageDto,
  NotificationResponseDto,
  ReadAllResultDto,
  UnreadCountDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth(BEARER_AUTH)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'The caller’s notifications, newest first; `after` returns only the newer ones.',
  })
  @ApiOkResponse({ type: NotificationPageDto })
  @ApiErrorResponses(400, 401)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    return this.notifications.list(user.userId, query.page, query.limit, query.after);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many of the caller’s notifications are unread.' })
  @ApiOkResponse({ type: UnreadCountDto })
  @ApiErrorResponses(401)
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountDto> {
    return this.notifications.unreadCount(user.userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marks all of the caller’s notifications read.' })
  @ApiOkResponse({ type: ReadAllResultDto })
  @ApiErrorResponses(401)
  readAll(@CurrentUser() user: AuthUser): Promise<ReadAllResultDto> {
    return this.notifications.markAllRead(user.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marks one of the caller’s notifications read.' })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiErrorResponses(400, 401, 404)
  read(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return this.notifications.markRead(user.userId, id);
  }
}
