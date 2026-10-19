import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ForbiddenError } from '../../common/exceptions';
import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerGuard } from '../sellers';

import { ListSellerOrdersQueryDto } from './dto/list-orders-query.dto';
import { SellerOrderDto, SellerOrderPageDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

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
  constructor(private readonly orders: OrdersService) {}

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
}
