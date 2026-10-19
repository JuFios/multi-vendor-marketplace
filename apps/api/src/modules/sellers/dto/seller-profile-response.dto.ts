import { ApiProperty } from '@nestjs/swagger';

import type { SellerApplication } from '../seller-application';

/** What anyone may see of an approved store; the owner and moderation data stay private. */
export class SellerProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  storeName: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(seller: SellerApplication): SellerProfileResponseDto {
    return {
      id: seller.id,
      storeName: seller.storeName,
      description: seller.description,
      createdAt: seller.createdAt.toISOString(),
    };
  }
}
