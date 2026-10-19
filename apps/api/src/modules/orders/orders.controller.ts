import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import { IDEMPOTENCY_SCOPE, Idempotent } from '../../idempotency';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CheckoutService } from './checkout.service';
import { OrderResponseDto } from './dto/order-response.dto';

@ApiTags('orders')
@ApiBearerAuth(BEARER_AUTH)
@Controller('orders')
export class OrdersController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent(IDEMPOTENCY_SCOPE.CHECKOUT)
  @ApiOperation({
    summary: 'Turns the cart into one order with a seller order per seller.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiErrorResponses(400, 401, 409, 422)
  create(@CurrentUser() user: AuthUser): Promise<OrderResponseDto> {
    return this.checkout.checkout(user.userId);
  }
}
