import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

import { ListModerationQueryDto } from './dto/list-moderation-query.dto';
import { RejectProductDto } from './dto/reject-product.dto';
import { SellerProductPageDto, SellerProductResponseDto } from './dto/seller-product-response.dto';
import { ProductsService } from './products.service';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Moderation queue, oldest first; pending products by default.' })
  @ApiOkResponse({ type: SellerProductPageDto })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query() query: ListModerationQueryDto): Promise<SellerProductPageDto> {
    const { items, total } = await this.products.listForModeration(query);
    return {
      items: items.map((item) => SellerProductResponseDto.from(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending product.' })
  @ApiOkResponse({ type: SellerProductResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async approve(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<SellerProductResponseDto> {
    return SellerProductResponseDto.from(await this.products.approve(admin.userId, id));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending product with a reason; it leaves the catalog.' })
  @ApiOkResponse({ type: SellerProductResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async reject(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: RejectProductDto,
  ): Promise<SellerProductResponseDto> {
    return SellerProductResponseDto.from(await this.products.reject(admin.userId, id, dto.reason));
  }
}
