import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

import { AuctionsService } from './auctions.service';
import { AuctionDto, BidPageDto } from './dto/auction-response.dto';
import { ListBidsQueryDto } from './dto/list-bids-query.dto';

@ApiTags('auctions')
@Public()
@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctions: AuctionsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Current state of an auction, never cached; includes the next minimum bid.',
  })
  @ApiOkResponse({ type: AuctionDto })
  @ApiErrorResponses(400, 404)
  get(@Param('id', ParseUuidPipe) id: string): Promise<AuctionDto> {
    return this.auctions.getSnapshot(id);
  }

  @Get(':id/bids')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({
    summary: 'Bids of a round, highest first. Other bidders are masked; your own are flagged.',
  })
  @ApiOkResponse({ type: BidPageDto })
  @ApiErrorResponses(400, 404)
  listBids(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id', ParseUuidPipe) id: string,
    @Query() query: ListBidsQueryDto,
  ): Promise<BidPageDto> {
    return this.auctions.listBids(id, user?.userId, query);
  }
}
