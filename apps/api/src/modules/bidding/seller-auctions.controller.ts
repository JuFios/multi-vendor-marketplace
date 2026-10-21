import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { CurrentSellerId } from '../auth/decorators/current-seller-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerGuard } from '../sellers/seller.guard';

import { AuctionsService } from './auctions.service';
import { AuctionPageDto } from './dto/auction-response.dto';

@ApiTags('seller-auctions')
@ApiBearerAuth(BEARER_AUTH)
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/auctions')
export class SellerAuctionsController {
  constructor(private readonly auctions: AuctionsService) {}

  @Get()
  @ApiOperation({ summary: 'The store’s own auctions with their current bids, newest first.' })
  @ApiOkResponse({ type: AuctionPageDto })
  @ApiErrorResponses(400, 401, 403)
  list(
    @CurrentSellerId() sellerId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<AuctionPageDto> {
    return this.auctions.listOfSeller(sellerId, query.page, query.limit);
  }
}
