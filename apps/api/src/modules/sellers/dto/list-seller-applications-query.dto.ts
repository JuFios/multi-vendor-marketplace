import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SELLER_STATUSES, type SellerStatus } from '../seller-application';

export class ListSellerApplicationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SELLER_STATUSES })
  @IsOptional()
  @IsIn(SELLER_STATUSES)
  status?: SellerStatus;
}
