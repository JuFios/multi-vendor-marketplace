import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { IsMoneyCents } from '../../../common/decorators/is-money-cents.decorator';
import {
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_MAX_IMAGES,
  PRODUCT_TITLE_MAX_LENGTH,
} from '../product';

import { ProductImages, ProductText } from './product-fields';

/** Every field is optional; `type` and stock are deliberately absent. */
export class UpdateProductDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: PRODUCT_TITLE_MAX_LENGTH })
  @IsOptional()
  @ProductText(PRODUCT_TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @ProductText(PRODUCT_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ type: [String], maxItems: PRODUCT_MAX_IMAGES })
  @IsOptional()
  @ProductImages()
  images?: string[];

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsMoneyCents()
  priceCents?: number;
}
