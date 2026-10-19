import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../../common/decorators';
import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { ApplyForSellerDto } from './dto/apply-for-seller.dto';
import { SellerApplicationResponseDto } from './dto/seller-application-response.dto';
import { SellerProfileResponseDto } from './dto/seller-profile-response.dto';
import { SellersService } from './sellers.service';

@ApiTags('sellers')
@Controller('sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  @Post('applications')
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'Apply to become a seller, or re-apply after a rejection.' })
  @ApiCreatedResponse({ type: SellerApplicationResponseDto })
  @ApiErrorResponses(400, 401, 409)
  async apply(
    @CurrentUser() user: AuthUser,
    @Body() dto: ApplyForSellerDto,
  ): Promise<SellerApplicationResponseDto> {
    const application = await this.sellers.apply(user.userId, {
      storeName: dto.storeName,
      description: dto.description ?? null,
    });
    return SellerApplicationResponseDto.from(application);
  }

  @Get('applications/me')
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'The authenticated user’s seller application and its status.' })
  @ApiOkResponse({ type: SellerApplicationResponseDto })
  @ApiErrorResponses(401, 404)
  async myApplication(@CurrentUser() user: AuthUser): Promise<SellerApplicationResponseDto> {
    return SellerApplicationResponseDto.from(await this.sellers.getApplicationOf(user.userId));
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public profile of an approved store.' })
  @ApiOkResponse({ type: SellerProfileResponseDto })
  @ApiErrorResponses(400, 404)
  async profile(@Param('id', ParseUuidPipe) id: string): Promise<SellerProfileResponseDto> {
    return SellerProfileResponseDto.from(await this.sellers.getPublicProfile(id));
  }
}
