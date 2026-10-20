import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { Roles } from '../auth/decorators/roles.decorator';

import { AnalyticsService } from './analytics.service';
import { PeriodQueryDto, SalesChartQueryDto } from './dto/analytics-query.dto';
import { AnalyticsSummaryDto, SalesChartDto } from './dto/analytics-response.dto';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Platform revenue, sales by store, top products and stores, cart conversion.',
  })
  @ApiOkResponse({ type: AnalyticsSummaryDto })
  @ApiErrorResponses(400, 401, 403)
  summary(@Query() query: PeriodQueryDto): Promise<AnalyticsSummaryDto> {
    return this.analytics.summary(query.from, query.to);
  }

  @Get('sales-chart')
  @ApiOperation({ summary: 'Daily sales of the last N days next to the N days before.' })
  @ApiOkResponse({ type: SalesChartDto })
  @ApiErrorResponses(400, 401, 403)
  salesChart(@Query() query: SalesChartQueryDto): Promise<SalesChartDto> {
    return this.analytics.salesChart(query.days);
  }
}
