import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { CurrentSellerId } from '../auth/decorators/current-seller-id.decorator';
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
    @CurrentSellerId() sellerId: string,
    @Query() query: LedgerRangeQueryDto,
  ): Promise<FinanceSummaryDto> {
    return this.ledger.summaryOf(sellerId, query);
  }
}
