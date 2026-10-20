import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

import { CancelSellerOrderDto } from './dto/cancel-seller-order.dto';
import { AdminChangeStatusDto } from './dto/change-status.dto';
import { SellerOrderDto } from './dto/order-response.dto';
import { SellerOrderLifecycleService } from './seller-order-lifecycle.service';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/seller-orders')
export class AdminSellerOrdersController {
  constructor(private readonly lifecycle: SellerOrderLifecycleService) {}

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Completes a shipped seller order on the customer’s behalf.' })
  @ApiOkResponse({ type: SellerOrderDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: AdminChangeStatusDto,
  ): Promise<SellerOrderDto> {
    return this.lifecycle.changeStatus(id, dto.status, { type: 'ADMIN', userId: user.userId }, {});
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancels any seller order that is not final.' })
  @ApiOkResponse({ type: SellerOrderDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: CancelSellerOrderDto,
  ): Promise<SellerOrderDto> {
    return this.lifecycle.cancel(id, dto.reason, { type: 'ADMIN', userId: user.userId }, {});
  }
}
