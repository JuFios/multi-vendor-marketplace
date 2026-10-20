import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ForbiddenError } from '../../common/exceptions/app-error';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerGuard } from '../sellers/seller.guard';

import { CancelSellerOrderDto } from './dto/cancel-seller-order.dto';
import { SellerChangeStatusDto } from './dto/change-status.dto';
import { ListSellerOrdersQueryDto } from './dto/list-orders-query.dto';
import { SellerOrderDto, SellerOrderPageDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';
import { SellerOrderLifecycleService } from './seller-order-lifecycle.service';

/** The store id of an approved seller; `SellerGuard` has already checked the store. */
function sellerIdOf(user: AuthUser): string {
  if (user.sellerId === undefined) {
    throw new ForbiddenError('Only approved sellers can do this', 'SELLER_NOT_APPROVED');
  }
  return user.sellerId;
}

@ApiTags('seller-orders')
@ApiBearerAuth(BEARER_AUTH)
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/orders')
export class SellerOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly lifecycle: SellerOrderLifecycleService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The store’s own seller orders, newest first.' })
  @ApiOkResponse({ type: SellerOrderPageDto })
  @ApiErrorResponses(400, 401, 403)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListSellerOrdersQueryDto,
  ): Promise<SellerOrderPageDto> {
    return this.orders.listOfSeller(sellerIdOf(user), query.status, query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of the store’s own seller orders; another store’s is 404.' })
  @ApiOkResponse({ type: SellerOrderDto })
  @ApiErrorResponses(400, 401, 403, 404)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<SellerOrderDto> {
    return this.orders.getOfSeller(sellerIdOf(user), id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Moves an own seller order to PROCESSING or SHIPPED.' })
  @ApiOkResponse({ type: SellerOrderDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: SellerChangeStatusDto,
  ): Promise<SellerOrderDto> {
    const sellerId = sellerIdOf(user);
    return this.lifecycle.changeStatus(
      id,
      dto.status,
      { type: 'SELLER', userId: user.userId },
      { sellerId },
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancels an own seller order that is NEW or PROCESSING.' })
  @ApiOkResponse({ type: SellerOrderDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: CancelSellerOrderDto,
  ): Promise<SellerOrderDto> {
    const sellerId = sellerIdOf(user);
    return this.lifecycle.cancel(
      id,
      dto.reason,
      { type: 'SELLER', userId: user.userId },
      { sellerId },
    );
  }
}
