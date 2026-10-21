import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { CurrentSellerId } from '../auth/decorators/current-seller-id.decorator';
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
  get(
    @CurrentSellerId() sellerId: string,
    @Query() query: PeriodQueryDto,
  ): Promise<SellerDashboardDto> {
    return this.dashboard.dashboard(sellerId, query.from, query.to);
  }
}
