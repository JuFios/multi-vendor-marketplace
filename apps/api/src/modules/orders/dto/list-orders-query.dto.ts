import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const LISTABLE_ORDER_STATUSES = [
  'NEW',
  'PROCESSING',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
] as const;

export const LISTABLE_SELLER_ORDER_STATUSES = [
  'NEW',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
] as const;

export class ListAdminOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LISTABLE_ORDER_STATUSES })
  @IsOptional()
  @IsEnum(LISTABLE_ORDER_STATUSES)
  status?: (typeof LISTABLE_ORDER_STATUSES)[number];
}

export class ListSellerOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LISTABLE_SELLER_ORDER_STATUSES })
  @IsOptional()
  @IsEnum(LISTABLE_SELLER_ORDER_STATUSES)
  status?: (typeof LISTABLE_SELLER_ORDER_STATUSES)[number];
}
