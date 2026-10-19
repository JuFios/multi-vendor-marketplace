import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators';
import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses } from '../../common/swagger';

import {
  ProductDetailsResponseDto,
  ProductStockResponseDto,
  ProductSummaryResponseDto,
} from './dto/product-details-response.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Public product page; only published products.' })
  @ApiOkResponse({ type: ProductDetailsResponseDto })
  @ApiErrorResponses(400, 404)
  getDetails(@Param('id', ParseUuidPipe) id: string): Promise<ProductDetailsResponseDto> {
    return this.products.getPublicDetails(id);
  }

  @Get(':id/stock')
  @ApiOperation({ summary: 'Current stock snapshot, never cached.' })
  @ApiOkResponse({ type: ProductStockResponseDto })
  @ApiErrorResponses(400, 404)
  async getStock(@Param('id', ParseUuidPipe) id: string): Promise<ProductStockResponseDto> {
    return ProductStockResponseDto.from(await this.products.getPublicStock(id));
  }

  @Get(':id/similar')
  @ApiOperation({ summary: 'Up to 8 other in-stock products of the same category.' })
  @ApiOkResponse({ type: [ProductSummaryResponseDto] })
  @ApiErrorResponses(400, 404)
  async getSimilar(@Param('id', ParseUuidPipe) id: string): Promise<ProductSummaryResponseDto[]> {
    return (await this.products.getSimilar(id)).map((product) =>
      ProductSummaryResponseDto.from(product),
    );
  }
}
