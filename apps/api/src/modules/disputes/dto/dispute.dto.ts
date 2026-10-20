import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { SanitizeText } from '../../../common/decorators/sanitize-text.decorator';
import type { DisputeMessageRecord, DisputeRecord } from '../dispute';
import { DISPUTE_MESSAGE_MAX_LENGTH, DISPUTE_REASON_MAX_LENGTH } from '../disputes.constants';

const STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED_BUYER_FAVOR', 'RESOLVED_SELLER_FAVOR'] as const;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDisputeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sellerOrderId: string;

  @ApiProperty({ minLength: 1, maxLength: DISPUTE_REASON_MAX_LENGTH })
  @SanitizeText()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(DISPUTE_REASON_MAX_LENGTH)
  reason: string;
}

export class CreateDisputeMessageDto {
  @ApiProperty({ minLength: 1, maxLength: DISPUTE_MESSAGE_MAX_LENGTH })
  @SanitizeText()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(DISPUTE_MESSAGE_MAX_LENGTH)
  text: string;
}

export class DisputeMessageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiProperty({ enum: ['CUSTOMER', 'SELLER', 'ADMIN'] })
  authorRole: string;

  @ApiProperty()
  text: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(message: DisputeMessageRecord): DisputeMessageDto {
    return {
      id: message.id,
      authorId: message.authorId,
      authorRole: message.authorRole,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

export class DisputeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty({ format: 'uuid' })
  sellerOrderId: string;

  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty({ format: 'uuid' })
  sellerId: string;

  @ApiProperty()
  reason: string;

  @ApiProperty({ enum: STATUSES })
  status: string;

  @ApiProperty({ nullable: true, type: String })
  resolutionNote: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  resolvedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(dispute: DisputeRecord): DisputeDto {
    return {
      id: dispute.id,
      orderId: dispute.orderId,
      sellerOrderId: dispute.sellerOrderId,
      customerId: dispute.customerId,
      sellerId: dispute.sellerId,
      reason: dispute.reason,
      status: dispute.status,
      resolutionNote: dispute.resolutionNote,
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      createdAt: dispute.createdAt.toISOString(),
    };
  }
}

export class DisputeDetailsDto extends DisputeDto {
  @ApiProperty({ type: [DisputeMessageDto] })
  messages: DisputeMessageDto[];

  static withMessages(
    dispute: DisputeRecord,
    messages: readonly DisputeMessageRecord[],
  ): DisputeDetailsDto {
    return {
      ...DisputeDto.from(dispute),
      messages: messages.map((message) => DisputeMessageDto.from(message)),
    };
  }
}

export class DisputePageDto {
  @ApiProperty({ type: [DisputeDto] })
  items: DisputeDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
