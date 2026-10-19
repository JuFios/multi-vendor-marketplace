import { ApiProperty } from '@nestjs/swagger';

import type { SellerApplication } from '../seller-application';

import { SellerApplicationResponseDto } from './seller-application-response.dto';

export class AdminSellerApplicationResponseDto extends SellerApplicationResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  static override from(application: SellerApplication): AdminSellerApplicationResponseDto {
    return { ...SellerApplicationResponseDto.from(application), userId: application.userId };
  }
}

export class SellerApplicationPageDto {
  @ApiProperty({ type: [AdminSellerApplicationResponseDto] })
  items: AdminSellerApplicationResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
