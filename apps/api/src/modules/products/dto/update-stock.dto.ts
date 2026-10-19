import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

import { PRODUCT_MAX_STOCK } from '../product';

export class UpdateStockDto {
  @ApiProperty({ minimum: 0, maximum: PRODUCT_MAX_STOCK, description: 'The new absolute stock.' })
  @IsInt()
  @Min(0)
  @Max(PRODUCT_MAX_STOCK)
  stock: number;
}
