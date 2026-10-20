import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { IDEMPOTENCY_SCOPE, Idempotent } from '../../idempotency';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { DEFAULT_CANCEL_REASONS } from './cancellation';
import { CheckoutService } from './checkout.service';
import { OrderPageDto, OrderResponseDto, SellerOrderDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';
import { SellerOrderLifecycleService } from './seller-order-lifecycle.service';

@ApiTags('orders')
@ApiBearerAuth(BEARER_AUTH)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
    private readonly lifecycle: SellerOrderLifecycleService,
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

  @Post(':orderId/seller-orders/:soId/confirm-receipt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirms receipt of a shipped seller order of an own order.' })
  @ApiOkResponse({ type: SellerOrderDto })
  @ApiErrorResponses(400, 401, 404, 409)
  confirmReceipt(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUuidPipe) orderId: string,
    @Param('soId', ParseUuidPipe) sellerOrderId: string,
  ): Promise<SellerOrderDto> {
    return this.lifecycle.changeStatus(
      sellerOrderId,
      'COMPLETED',
      { type: 'CUSTOMER', userId: user.userId },
      { customerId: user.userId, orderId },
    );
  }

  @Post(':orderId/seller-orders/:soId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancels a seller order of an own order while it is still NEW.' })
  @ApiOkResponse({ type: SellerOrderDto })
  @ApiErrorResponses(400, 401, 404, 409)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUuidPipe) orderId: string,
    @Param('soId', ParseUuidPipe) sellerOrderId: string,
  ): Promise<SellerOrderDto> {
    return this.lifecycle.cancel(
      sellerOrderId,
      DEFAULT_CANCEL_REASONS.CUSTOMER,
      { type: 'CUSTOMER', userId: user.userId },
      { customerId: user.userId, orderId },
    );
  }
}
