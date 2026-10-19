import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const SELLER_TARGET_STATUSES = ['PROCESSING', 'SHIPPED'] as const;
export const ADMIN_TARGET_STATUSES = ['COMPLETED'] as const;

export class SellerChangeStatusDto {
  @ApiProperty({ enum: SELLER_TARGET_STATUSES })
  @IsIn(SELLER_TARGET_STATUSES)
  status: (typeof SELLER_TARGET_STATUSES)[number];
}

export class AdminChangeStatusDto {
  @ApiProperty({ enum: ADMIN_TARGET_STATUSES })
  @IsIn(ADMIN_TARGET_STATUSES)
  status: (typeof ADMIN_TARGET_STATUSES)[number];
}
