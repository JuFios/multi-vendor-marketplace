import { ApiProperty } from '@nestjs/swagger';

import type { Eligibility, IneligibilityReason, ReviewRecord } from '../review';

export class ReviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  authorName: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating: number;

  @ApiProperty()
  text: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(review: ReviewRecord, authorName: string): ReviewResponseDto {
    return {
      id: review.id,
      productId: review.productId,
      authorName,
      rating: review.rating,
      text: review.text,
      createdAt: review.createdAt.toISOString(),
    };
  }
}

export class ReviewPageDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  items: ReviewResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class ReviewEligibilityDto {
  @ApiProperty()
  eligible: boolean;

  @ApiProperty({ enum: ['NOT_PURCHASED', 'ALREADY_REVIEWED'], nullable: true, type: String })
  reason: IneligibilityReason | null;

  static from(eligibility: Eligibility): ReviewEligibilityDto {
    return { eligible: eligibility.eligible, reason: eligibility.reason };
  }
}
