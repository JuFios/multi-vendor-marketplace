import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { Roles } from '../auth/decorators/roles.decorator';

import { AnalyticsService } from './analytics.service';
import { PeriodQueryDto, ReportQueryDto, SalesChartQueryDto } from './dto/analytics-query.dto';
import {
  AnalyticsReportDto,
  AnalyticsSummaryDto,
  SalesChartDto,
} from './dto/analytics-response.dto';
import { reportToCsv } from './report-csv';

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

  @Get('report')
  @ApiOperation({
    summary: 'The summary with daily and per-product figures, as a CSV or JSON download.',
  })
  @ApiProduces('application/json', 'text/csv')
  @ApiOkResponse({
    type: AnalyticsReportDto,
    description: 'JSON; with `format=csv` a text/csv file.',
  })
  @ApiErrorResponses(400, 401, 403)
  async report(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AnalyticsReportDto | string> {
    const report = await this.analytics.report(query.from, query.to);
    const { from, to } = report.summary;
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="analytics-report_${from}_${to}.${query.format}"`,
    );
    if (query.format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return reportToCsv(report);
    }
    return report;
  }
}
