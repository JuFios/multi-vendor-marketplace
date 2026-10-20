import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { SetCartQuantityDto } from './dto/set-cart-quantity.dto';

@ApiTags('cart')
@ApiBearerAuth(BEARER_AUTH)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'The cart, grouped by seller, with current prices and availability.' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiErrorResponses(401)
  get(@CurrentUser() user: AuthUser): Promise<CartResponseDto> {
    return this.cart.get(user.userId);
  }

  @Post('items')
  @ApiOperation({
    summary:
      'Adds to the quantity of a published fixed-price product, or adds an auction lot you won.',
  })
  @ApiCreatedResponse({ type: CartResponseDto })
  @ApiErrorResponses(400, 401, 404, 409, 422)
  addItem(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto): Promise<CartResponseDto> {
    return this.cart.addItem(user.userId, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Sets the quantity of a product already in the cart.' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiErrorResponses(400, 401, 404, 409)
  setQuantity(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUuidPipe) productId: string,
    @Body() dto: SetCartQuantityDto,
  ): Promise<CartResponseDto> {
    return this.cart.setQuantity(user.userId, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Removes a product from the cart.' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiErrorResponses(400, 401, 404)
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUuidPipe) productId: string,
  ): Promise<CartResponseDto> {
    return this.cart.removeItem(user.userId, productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Empties the cart.' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiErrorResponses(401)
  clear(@CurrentUser() user: AuthUser): Promise<CartResponseDto> {
    return this.cart.clear(user.userId);
  }
}
