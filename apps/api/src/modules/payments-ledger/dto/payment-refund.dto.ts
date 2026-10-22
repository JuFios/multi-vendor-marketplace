import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import type { PaymentRefundRecord } from '../payment-refunds.repository';

export const PAYMENT_REFUND_STATUSES = ['REFUNDED', 'FAILED'] as const;

export class AdminPaymentRefundsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PAYMENT_REFUND_STATUSES,
    description: 'Only answers with this outcome; FAILED lists the refunds that need a person.',
  })
  @IsOptional()
  @IsEnum(PAYMENT_REFUND_STATUSES)
  status?: (typeof PAYMENT_REFUND_STATUSES)[number];
}

export class PaymentRefundDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    format: 'uuid',
    description: 'The idempotency key sent to the gateway (the refund request event id).',
  })
  refundKey: string;

  @ApiProperty({ format: 'uuid' })
  sellerOrderId: string;

  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty({ format: 'uuid' })
  sellerId: string;

  @ApiProperty({ description: 'The amount asked back for the buyer, in kopecks.' })
  amountCents: number;

  @ApiProperty({ enum: PAYMENT_REFUND_STATUSES })
  status: string;

  @ApiProperty({ nullable: true, type: String, description: 'The gateway’s reference when paid.' })
  providerRef: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Why the gateway refused it.' })
  failureReason: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(record: PaymentRefundRecord): PaymentRefundDto {
    return { ...record, createdAt: record.createdAt.toISOString() };
  }
}

export class PaymentRefundPageDto {
  @ApiProperty({ type: [PaymentRefundDto] })
  items: PaymentRefundDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
