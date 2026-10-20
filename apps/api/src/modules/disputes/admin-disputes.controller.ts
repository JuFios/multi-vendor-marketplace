import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { IDEMPOTENCY_SCOPE } from '../../idempotency/idempotency.constants';
import { Idempotent } from '../../idempotency/idempotent.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

import { DisputesService } from './disputes.service';
import {
  ListAdminDisputesQueryDto,
  ResolveDisputeDto,
  ResolveDisputeResultDto,
} from './dto/admin-dispute.dto';
import { DisputeDto, DisputePageDto } from './dto/dispute.dto';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  @ApiOperation({ summary: 'All disputes, newest first, optionally by status.' })
  @ApiOkResponse({ type: DisputePageDto })
  @ApiErrorResponses(400, 401, 403)
  list(@Query() query: ListAdminDisputesQueryDto): Promise<DisputePageDto> {
    return this.disputes.listAll(query.status, query.page, query.limit);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Takes an open dispute into review.' })
  @ApiOkResponse({ type: DisputeDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  review(@Param('id', ParseUuidPipe) id: string): Promise<DisputeDto> {
    return this.disputes.startReview(id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @Idempotent(IDEMPOTENCY_SCOPE.DISPUTE_RESOLVE)
  @ApiOperation({
    summary:
      'Decides the dispute; a decision for the buyer may refund items and set the final seller order status.',
  })
  @ApiOkResponse({ type: ResolveDisputeResultDto })
  @ApiErrorResponses(400, 401, 403, 404, 409, 422)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ): Promise<ResolveDisputeResultDto> {
    return this.disputes.resolve(user.userId, id, dto);
  }
}
