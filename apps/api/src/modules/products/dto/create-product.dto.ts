import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

import { IsMoneyCents } from '../../../common/decorators';
import {
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_MAX_IMAGES,
  PRODUCT_MAX_STOCK,
  PRODUCT_TITLE_MAX_LENGTH,
  PRODUCT_TYPES,
  type ProductType,
} from '../product';

import { ProductImages, ProductText } from './product-fields';

export class CreateProductDto {
  @ApiProperty({ enum: PRODUCT_TYPES })
  @IsEnum(PRODUCT_TYPES)
  type: ProductType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ minLength: 1, maxLength: PRODUCT_TITLE_MAX_LENGTH })
  @ProductText(PRODUCT_TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({ minLength: 1, maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH })
  @ProductText(PRODUCT_DESCRIPTION_MAX_LENGTH)
  description: string;

  @ApiPropertyOptional({ type: [String], maxItems: PRODUCT_MAX_IMAGES, description: 'Image URLs.' })
  @IsOptional()
  @ProductImages()
  images?: string[];

  @ApiPropertyOptional({ minimum: 1, description: 'Price in cents; required for FIXED_PRICE.' })
  @ValidateIf((product: CreateProductDto) => product.type !== 'AUCTION')
  @IsMoneyCents()
  priceCents?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: PRODUCT_MAX_STOCK,
    description: 'Required for FIXED_PRICE.',
  })
  @ValidateIf((product: CreateProductDto) => product.type !== 'AUCTION')
  @IsInt()
  @Min(0)
  @Max(PRODUCT_MAX_STOCK)
  stock?: number;
}
