import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ForbiddenError } from '../../common/exceptions';
import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerGuard } from '../sellers/seller.guard';

import { CreateProductDto } from './dto/create-product.dto';
import { ListOwnedProductsQueryDto } from './dto/list-owned-products-query.dto';
import { SellerProductPageDto, SellerProductResponseDto } from './dto/seller-product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { ProductsService } from './products.service';

/** The store id of an approved seller; `SellerGuard` has already checked the store. */
function sellerIdOf(user: AuthUser): string {
  if (user.sellerId === undefined) {
    throw new ForbiddenError('Only approved sellers can do this', 'SELLER_NOT_APPROVED');
  }
  return user.sellerId;
}

@ApiTags('seller-products')
@ApiBearerAuth(BEARER_AUTH)
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'The seller’s own products, newest first.' })
  @ApiOkResponse({ type: SellerProductPageDto })
  @ApiErrorResponses(400, 401, 403)
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOwnedProductsQueryDto,
  ): Promise<SellerProductPageDto> {
    const { items, total } = await this.products.listOwned(sellerIdOf(user), query);
    return {
      items: items.map((item) => SellerProductResponseDto.from(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a product.' })
  @ApiCreatedResponse({ type: SellerProductResponseDto })
  @ApiErrorResponses(400, 401, 403)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductDto,
  ): Promise<SellerProductResponseDto> {
    const product = await this.products.create(sellerIdOf(user), dto.type, {
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      images: dto.images ?? [],
      priceCents: dto.priceCents ?? 0,
      stock: dto.stock ?? 0,
    });
    return SellerProductResponseDto.from(product);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of the seller’s own products.' })
  @ApiOkResponse({ type: SellerProductResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<SellerProductResponseDto> {
    return SellerProductResponseDto.from(await this.products.getOwned(sellerIdOf(user), id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a product; its type cannot change.' })
  @ApiOkResponse({ type: SellerProductResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<SellerProductResponseDto> {
    return SellerProductResponseDto.from(await this.products.update(sellerIdOf(user), id, dto));
  }

  @Patch(':id/stock')
  @ApiOperation({ summary: 'Set the stock to an absolute value.' })
  @ApiOkResponse({ type: SellerProductResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  async setStock(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateStockDto,
  ): Promise<SellerProductResponseDto> {
    return SellerProductResponseDto.from(
      await this.products.setStock(sellerIdOf(user), id, dto.stock),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product by archiving it.' })
  @ApiNoContentResponse()
  @ApiErrorResponses(400, 401, 403, 404)
  async archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<void> {
    await this.products.archive(sellerIdOf(user), id);
  }
}
