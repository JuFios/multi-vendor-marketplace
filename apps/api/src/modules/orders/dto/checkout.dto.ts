import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

import { IsMoneyCents } from '../../../common/decorators/is-money-cents.decorator';
import { MAX_STORED_MONEY_CENTS } from '../../../common/money';

export class CheckoutDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_STORED_MONEY_CENTS,
    description:
      'The total the buyer saw, in cents. When prices changed meanwhile the checkout is refused ' +
      'with 409 CHECKOUT_TOTAL_CHANGED instead of charging a different amount.',
  })
  @IsOptional()
  @IsMoneyCents({ max: MAX_STORED_MONEY_CENTS })
  expectedTotalCents?: number;
}
