import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ForbiddenError } from '../../common/exceptions/app-error';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerGuard } from '../sellers/seller.guard';

import { PeriodQueryDto } from './dto/analytics-query.dto';
import { SellerDashboardDto } from './dto/seller-dashboard.dto';
import { SellerDashboardService } from './seller-dashboard.service';

@ApiTags('seller-dashboard')
@ApiBearerAuth(BEARER_AUTH)
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/dashboard')
export class SellerDashboardController {
  constructor(private readonly dashboard: SellerDashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'The store’s revenue, seller orders by status, recent orders and live auctions.',
  })
  @ApiOkResponse({ type: SellerDashboardDto })
  @ApiErrorResponses(400, 401, 403)
  get(@CurrentUser() user: AuthUser, @Query() query: PeriodQueryDto): Promise<SellerDashboardDto> {
    if (user.sellerId === undefined) {
      throw new ForbiddenError('Only approved sellers can do this', 'SELLER_NOT_APPROVED');
    }
    return this.dashboard.dashboard(user.sellerId, query.from, query.to);
  }
}
