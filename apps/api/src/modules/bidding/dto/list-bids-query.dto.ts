import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListBidsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Defaults to the current round.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  round?: number;
}
