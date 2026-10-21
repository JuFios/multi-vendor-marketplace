import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { PRODUCT_MAX_STOCK } from '../product';

export class UpdateStockDto {
  @ApiProperty({ minimum: 0, maximum: PRODUCT_MAX_STOCK, description: 'The new absolute stock.' })
  @IsInt()
  @Min(0)
  @Max(PRODUCT_MAX_STOCK)
  stock: number;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'The product `version` the new stock was decided on. When given and the product has ' +
      'changed since (a sale, another edit), nothing is written and the answer is ' +
      '409 PRODUCT_VERSION_CONFLICT with the current stock and version.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
