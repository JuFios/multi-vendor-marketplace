import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { SanitizeText } from '../../../common/decorators/sanitize-text.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SellerOrderDto } from '../../orders/dto/order-response.dto';
import {
  REFUND_MAX_ITEMS,
  REFUND_REASON_MAX_LENGTH,
  RefundItemDto,
  RefundResultDto,
} from '../../orders/dto/refund.dto';

import { DisputeDto } from './dispute.dto';

export const RESOLUTION_OUTCOMES = ['RESOLVED_BUYER_FAVOR', 'RESOLVED_SELLER_FAVOR'] as const;
export const FINAL_SELLER_ORDER_STATUSES = ['CANCELLED', 'COMPLETED'] as const;
export const DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW', ...RESOLUTION_OUTCOMES] as const;

export class ListAdminDisputesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DISPUTE_STATUSES })
  @IsOptional()
  @IsIn(DISPUTE_STATUSES)
  status?: (typeof DISPUTE_STATUSES)[number];
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: RESOLUTION_OUTCOMES })
  @IsIn(RESOLUTION_OUTCOMES)
  outcome: (typeof RESOLUTION_OUTCOMES)[number];

  @ApiPropertyOptional({
    type: [RefundItemDto],
    description: 'Items to refund; only with RESOLVED_BUYER_FAVOR.',
  })
  @IsOptional()
  @ArrayMaxSize(REFUND_MAX_ITEMS)
  @ArrayUnique((item: RefundItemDto) => item.sellerOrderItemId)
  @ValidateNested({ each: true })
  @Type(() => RefundItemDto)
  refundItems?: RefundItemDto[];

  @ApiPropertyOptional({
    enum: FINAL_SELLER_ORDER_STATUSES,
    description: 'The status the seller order ends in; only with RESOLVED_BUYER_FAVOR.',
  })
  @IsOptional()
  @IsIn(FINAL_SELLER_ORDER_STATUSES)
  sellerOrderFinalStatus?: (typeof FINAL_SELLER_ORDER_STATUSES)[number];

  @ApiProperty({ minLength: 1, maxLength: REFUND_REASON_MAX_LENGTH })
  @SanitizeText()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(REFUND_REASON_MAX_LENGTH)
  note: string;
}

export class ResolveDisputeResultDto {
  @ApiProperty({ type: DisputeDto })
  dispute: DisputeDto;

  @ApiProperty({ type: RefundResultDto, nullable: true })
  refund: RefundResultDto | null;

  @ApiProperty({ type: SellerOrderDto })
  sellerOrder: SellerOrderDto;
}
