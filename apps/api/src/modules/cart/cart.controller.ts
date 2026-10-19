import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CartService } from './cart.service';
import { CartResponseDto } from './dto/cart-response.dto';

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
}
