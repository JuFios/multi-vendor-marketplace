import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto';
import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import { IDEMPOTENCY_SCOPE, Idempotent } from '../../idempotency';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CheckoutService } from './checkout.service';
import { OrderPageDto, OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth(BEARER_AUTH)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

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

  @Get()
  @ApiOperation({ summary: 'The caller’s own orders, newest first.' })
  @ApiOkResponse({ type: OrderPageDto })
  @ApiErrorResponses(400, 401)
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto): Promise<OrderPageDto> {
    return this.orders.listOfCustomer(user.userId, query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of the caller’s own orders; anyone else’s is 404.' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiErrorResponses(400, 401, 404)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.orders.getOfCustomer(user.userId, id);
  }
}
