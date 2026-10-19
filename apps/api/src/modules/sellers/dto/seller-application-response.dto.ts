import { ApiProperty } from '@nestjs/swagger';

import { SELLER_STATUSES, type SellerApplication, type SellerStatus } from '../seller-application';

export class SellerApplicationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  storeName: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ enum: SELLER_STATUSES })
  status: SellerStatus;

  @ApiProperty({ nullable: true, type: String })
  rejectionReason: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  moderatedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(application: SellerApplication): SellerApplicationResponseDto {
    return {
      id: application.id,
      storeName: application.storeName,
      description: application.description,
      status: application.status,
      rejectionReason: application.rejectionReason,
      moderatedAt: application.moderatedAt?.toISOString() ?? null,
      createdAt: application.createdAt.toISOString(),
    };
  }
}
