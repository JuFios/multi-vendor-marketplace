import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import { IsMoneyCents } from '../../../common/decorators/is-money-cents.decorator';
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

  @ApiPropertyOptional({ minimum: 1, description: 'Starting bid in cents; required for AUCTION.' })
  @ValidateIf((product: CreateProductDto) => product.type === 'AUCTION')
  @IsMoneyCents()
  startPriceCents?: number;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Minimum raise per bid in cents; required for AUCTION.',
  })
  @ValidateIf((product: CreateProductDto) => product.type === 'AUCTION')
  @IsMoneyCents()
  bidStepCents?: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the first round ends, 1 minute to 30 days from now; required for AUCTION.',
  })
  @ValidateIf((product: CreateProductDto) => product.type === 'AUCTION')
  @IsISO8601({ strict: true })
  endsAt?: string;
}
