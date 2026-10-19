import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

import { CART_MAX_QUANTITY, CART_MIN_QUANTITY } from '../cart';

export class SetCartQuantityDto {
  @ApiProperty({ minimum: CART_MIN_QUANTITY, maximum: CART_MAX_QUANTITY })
  @IsInt()
  @Min(CART_MIN_QUANTITY)
  @Max(CART_MAX_QUANTITY)
  quantity: number;
}
