import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto';
import {
  MODERATION_STATUSES,
  type ModerationStatus,
  PRODUCT_TYPES,
  type ProductType,
} from '../product';

export class ListOwnedProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: MODERATION_STATUSES })
  @IsOptional()
  @IsEnum(MODERATION_STATUSES)
  moderationStatus?: ModerationStatus;

  @ApiPropertyOptional({ enum: PRODUCT_TYPES })
  @IsOptional()
  @IsEnum(PRODUCT_TYPES)
  type?: ProductType;
}
