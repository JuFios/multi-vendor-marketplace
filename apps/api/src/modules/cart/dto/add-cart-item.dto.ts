import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import { SetCartQuantityDto } from './set-cart-quantity.dto';

export class AddCartItemDto extends SetCartQuantityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;
}
