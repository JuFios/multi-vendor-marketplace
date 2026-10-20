import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import { Roles } from '../auth/decorators/roles.decorator';

import { AdminLedgerQueryDto } from './dto/ledger-query.dto';
import { LedgerPageDto } from './dto/ledger-response.dto';
import { LedgerService } from './ledger.service';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/ledger')
export class AdminLedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  @ApiOperation({ summary: 'Ledger entries, newest first, by store and period.' })
  @ApiOkResponse({ type: LedgerPageDto })
  @ApiErrorResponses(400, 401, 403)
  list(@Query() query: AdminLedgerQueryDto): Promise<LedgerPageDto> {
    return this.ledger.listEntries(query);
  }
}
