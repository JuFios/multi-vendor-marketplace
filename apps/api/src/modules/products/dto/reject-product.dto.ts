import { ApiProperty } from '@nestjs/swagger';

import { MODERATION_REASON_MAX_LENGTH } from '../product';

import { ProductText } from './product-fields';

export class RejectProductDto {
  @ApiProperty({ minLength: 1, maxLength: MODERATION_REASON_MAX_LENGTH })
  @ProductText(MODERATION_REASON_MAX_LENGTH)
  reason: string;
}
