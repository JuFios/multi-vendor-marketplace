import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import type { DisputeViewer } from './dispute';
import { DisputesService } from './disputes.service';
import {
  CreateDisputeDto,
  CreateDisputeMessageDto,
  DisputeDetailsDto,
  DisputeDto,
  DisputeMessageDto,
  DisputePageDto,
} from './dto/dispute.dto';

export function viewerOf(user: AuthUser): DisputeViewer {
  return { userId: user.userId, sellerId: user.sellerId, isAdmin: user.roles.includes('ADMIN') };
}

@ApiTags('disputes')
@ApiBearerAuth(BEARER_AUTH)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Opens a dispute on a seller order of the caller’s own order.' })
  @ApiCreatedResponse({ type: DisputeDto })
  @ApiErrorResponses(400, 401, 404, 409)
  open(@CurrentUser() user: AuthUser, @Body() dto: CreateDisputeDto): Promise<DisputeDto> {
    return this.disputes.open(user.userId, dto.sellerOrderId, dto.reason);
  }

  @Get()
  @ApiOperation({ summary: 'Own disputes as a customer, plus those on the store’s seller orders.' })
  @ApiOkResponse({ type: DisputePageDto })
  @ApiErrorResponses(400, 401)
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto): Promise<DisputePageDto> {
    return this.disputes.list(viewerOf(user), query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A dispute with its messages; anyone not involved gets 404.' })
  @ApiOkResponse({ type: DisputeDetailsDto })
  @ApiErrorResponses(400, 401, 404)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<DisputeDetailsDto> {
    return this.disputes.get(viewerOf(user), id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adds a message while the dispute is not resolved.' })
  @ApiCreatedResponse({ type: DisputeMessageDto })
  @ApiErrorResponses(400, 401, 404, 409)
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: CreateDisputeMessageDto,
  ): Promise<DisputeMessageDto> {
    return this.disputes.addMessage(viewerOf(user), id, dto.text);
  }
}
