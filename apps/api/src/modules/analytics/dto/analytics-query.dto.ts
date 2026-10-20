import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

import { DEFAULT_PERIOD_DAYS, MAX_PERIOD_DAYS } from '../report-period';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A period of calendar days in the analytics time zone, both ends included. */
export class PeriodQueryDto {
  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'First day. Defaults to 29 days before `to`, so the period is 30 days.',
  })
  @IsOptional()
  @Matches(DAY, { message: 'from must be a day like 2026-03-01' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Last day. Defaults to today.' })
  @IsOptional()
  @Matches(DAY, { message: 'to must be a day like 2026-03-30' })
  to?: string;
}

export class SalesChartQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_PERIOD_DAYS,
    minimum: 1,
    maximum: MAX_PERIOD_DAYS,
    description: 'Days in the chart, ending today; the previous period has as many days.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PERIOD_DAYS)
  days: number = DEFAULT_PERIOD_DAYS;
}
