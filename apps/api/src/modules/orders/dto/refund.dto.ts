import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { SanitizeText } from '../../../common/decorators/sanitize-text.decorator';

import { SellerOrderDto } from './order-response.dto';

export const REFUND_REASON_MAX_LENGTH = 500;
export const REFUND_MAX_ITEMS = 100;
const REFUND_MAX_QUANTITY = 1_000_000;

export class RefundItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sellerOrderItemId: string;

  @ApiProperty({ minimum: 1, description: 'How many units to give back; at most what is left.' })
  @IsInt()
  @Min(1)
  @Max(REFUND_MAX_QUANTITY)
  quantity: number;
}

export class CreateRefundDto {
  @ApiProperty({ type: [RefundItemDto], minItems: 1, maxItems: REFUND_MAX_ITEMS })
  @ArrayNotEmpty()
  @ArrayMaxSize(REFUND_MAX_ITEMS)
  @ArrayUnique((item: RefundItemDto) => item.sellerOrderItemId)
  @ValidateNested({ each: true })
  @Type(() => RefundItemDto)
  items: RefundItemDto[];

  @ApiProperty({ minLength: 1, maxLength: REFUND_REASON_MAX_LENGTH })
  @SanitizeText()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(REFUND_REASON_MAX_LENGTH)
  reason: string;
}

export class RefundLineDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  sellerOrderItemId: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ description: 'Refunded amount in kopecks.' })
  amountCents: number;
}

/** Plain JSON: it is also stored as the replayed response. */
export class RefundResultDto {
  @ApiProperty({ description: 'Total refunded by this request, in kopecks.' })
  amountCents: number;

  @ApiProperty({ type: [RefundLineDto] })
  refunds: RefundLineDto[];

  @ApiProperty({ type: SellerOrderDto, description: 'The seller order after the refund.' })
  sellerOrder: SellerOrderDto;
}
