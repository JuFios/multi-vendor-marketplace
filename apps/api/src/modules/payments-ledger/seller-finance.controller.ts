import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ForbiddenError } from '../../common/exceptions/app-error';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerGuard } from '../sellers/seller.guard';

import { LedgerRangeQueryDto } from './dto/ledger-query.dto';
import { FinanceSummaryDto } from './dto/ledger-response.dto';
import { LedgerService } from './ledger.service';

@ApiTags('finance')
@ApiBearerAuth(BEARER_AUTH)
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/finance')
export class SellerFinanceController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  @ApiOperation({ summary: 'The store’s gross, refunds, commission, net, payouts and balance.' })
  @ApiOkResponse({ type: FinanceSummaryDto })
  @ApiErrorResponses(400, 401, 403)
  summary(
    @CurrentUser() user: AuthUser,
    @Query() query: LedgerRangeQueryDto,
  ): Promise<FinanceSummaryDto> {
    if (user.sellerId === undefined) {
      throw new ForbiddenError('Only approved sellers can do this', 'SELLER_NOT_APPROVED');
    }
    return this.ledger.summaryOf(user.sellerId, query);
  }
}
