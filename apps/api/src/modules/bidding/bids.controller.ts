import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { RateLimit } from '../../common/throttling/rate-limit.decorator';
import { THROTTLER } from '../../common/throttling/throttler-names';
import { IDEMPOTENCY_SCOPE } from '../../idempotency/idempotency.constants';
import { Idempotent } from '../../idempotency/idempotent.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { BidsService } from './bids.service';
import { PlaceBidDto, PlacedBidDto } from './dto/place-bid.dto';

@ApiTags('auctions')
@ApiBearerAuth(BEARER_AUTH)
@Controller('auctions')
export class BidsController {
  constructor(private readonly bids: BidsService) {}

  @Post(':id/bids')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(THROTTLER.BID)
  @Idempotent(IDEMPOTENCY_SCOPE.BID)
  @ApiOperation({
    summary:
      'Places a bid. Lower than the minimum next bid, after the deadline or on your own lot is 422.',
  })
  @ApiCreatedResponse({ type: PlacedBidDto })
  @ApiErrorResponses(400, 401, 404, 409, 422, 429)
  place(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: PlaceBidDto,
  ): Promise<PlacedBidDto> {
    return this.bids.placeBid(id, user.userId, dto.amountCents);
  }
}
