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
      'The stock the new value was decided on. When given and the stock has changed since (a ' +
      'sale, a cancellation), nothing is written and the answer is 409 PRODUCT_STOCK_CONFLICT ' +
      'with the current stock. Other edits of the product (a review, a new title) do not count.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedStock?: number;
}
