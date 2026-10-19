import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import { Roles } from '../auth/decorators/roles.decorator';

import { ListAdminOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderPageDto, OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'All orders, newest first.' })
  @ApiOkResponse({ type: OrderPageDto })
  @ApiErrorResponses(400, 401, 403)
  list(@Query() query: ListAdminOrdersQueryDto): Promise<OrderPageDto> {
    return this.orders.listAll(query.status, query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Any order with its seller orders.' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  get(@Param('id', ParseUuidPipe) id: string): Promise<OrderResponseDto> {
    return this.orders.getAny(id);
  }
}
