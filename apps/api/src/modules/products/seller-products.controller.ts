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

import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { CurrentSellerId } from '../auth/decorators/current-seller-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerGuard } from '../sellers/seller.guard';

import { CreateProductDto } from './dto/create-product.dto';
import { ListOwnedProductsQueryDto } from './dto/list-owned-products-query.dto';
import { SellerProductPageDto, SellerProductResponseDto } from './dto/seller-product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { ProductsService } from './products.service';

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
    @CurrentSellerId() sellerId: string,
    @Query() query: ListOwnedProductsQueryDto,
  ): Promise<SellerProductPageDto> {
    const { items, total } = await this.products.listOwned(sellerId, query);
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
    @CurrentSellerId() sellerId: string,
    @Body() dto: CreateProductDto,
  ): Promise<SellerProductResponseDto> {
    const text = {
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      images: dto.images ?? [],
    };
    if (dto.type === 'AUCTION') {
      const { product, auction } = await this.products.createAuction(sellerId, {
        ...text,
        startPriceCents: dto.startPriceCents ?? 0,
        bidStepCents: dto.bidStepCents ?? 0,
        endsAt: new Date(dto.endsAt ?? ''),
      });
      return SellerProductResponseDto.from(product, auction.id);
    }
    const product = await this.products.create(sellerId, {
      ...text,
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
    @CurrentSellerId() sellerId: string,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<SellerProductResponseDto> {
    return SellerProductResponseDto.from(await this.products.getOwned(sellerId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a product; its type cannot change.' })
  @ApiOkResponse({ type: SellerProductResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  async update(
    @CurrentSellerId() sellerId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<SellerProductResponseDto> {
    return SellerProductResponseDto.from(await this.products.update(sellerId, id, dto));
  }

  @Patch(':id/stock')
  @ApiOperation({ summary: 'Set the stock to an absolute value.' })
  @ApiOkResponse({ type: SellerProductResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async setStock(
    @CurrentSellerId() sellerId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateStockDto,
  ): Promise<SellerProductResponseDto> {
    return SellerProductResponseDto.from(
      await this.products.setStock(sellerId, id, dto.stock, dto.expectedStock),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product by archiving it.' })
  @ApiNoContentResponse()
  @ApiErrorResponses(400, 401, 403, 404)
  async archive(
    @CurrentSellerId() sellerId: string,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<void> {
    await this.products.archive(sellerId, id);
  }
}
