import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { Roles } from '../auth/decorators/roles.decorator';

import { AdminPaymentRefundsQueryDto, PaymentRefundPageDto } from './dto/payment-refund.dto';
import { PaymentsService } from './payments.service';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/payment-refunds')
export class AdminPaymentRefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'The payment gateway’s answers to refund requests, newest first.' })
  @ApiOkResponse({ type: PaymentRefundPageDto })
  @ApiErrorResponses(400, 401, 403)
  list(@Query() query: AdminPaymentRefundsQueryDto): Promise<PaymentRefundPageDto> {
    return this.payments.listRefunds(query);
  }
}
