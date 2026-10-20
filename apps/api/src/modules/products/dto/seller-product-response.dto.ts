import { ApiProperty } from '@nestjs/swagger';

import {
  MODERATION_STATUSES,
  type ModerationStatus,
  PRODUCT_TYPES,
  type Product,
  type ProductType,
} from '../product';

/** A product with its moderation state, as its owner (and an admin) sees it. */
export class SellerProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  sellerId: string;

  @ApiProperty({ format: 'uuid' })
  categoryId: string;

  @ApiProperty({ enum: PRODUCT_TYPES })
  type: ProductType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ type: Number, nullable: true })
  priceCents: number | null;

  @ApiProperty()
  stock: number;

  @ApiProperty()
  version: number;

  @ApiProperty({ enum: MODERATION_STATUSES })
  moderationStatus: ModerationStatus;

  @ApiProperty({ type: String, nullable: true })
  moderationReason: string | null;

  @ApiProperty()
  isPublished: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt: string | null;

  @ApiProperty({ description: 'Average rating, two decimals.' })
  ratingAvg: number;

  @ApiProperty()
  ratingCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The auction of an AUCTION product, set when the lot is created.',
  })
  auctionId: string | null;

  static from(product: Product, auctionId: string | null = null): SellerProductResponseDto {
    return {
      auctionId,
      id: product.id,
      sellerId: product.sellerId,
      categoryId: product.categoryId,
      type: product.type,
      title: product.title,
      description: product.description,
      images: [...product.images],
      priceCents: product.priceCents,
      stock: product.stock,
      version: product.version,
      moderationStatus: product.moderationStatus,
      moderationReason: product.moderationReason,
      isPublished: product.isPublished,
      archivedAt: product.archivedAt?.toISOString() ?? null,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}

export class SellerProductPageDto {
  @ApiProperty({ type: [SellerProductResponseDto] })
  items: SellerProductResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
