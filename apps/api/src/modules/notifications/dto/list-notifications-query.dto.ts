import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Only notifications created after this moment: what a client missed while it was offline.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  after?: Date;
}
