import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** The period of a ledger query: entries with `from <= createdAt <= to`; both ends optional. */
export class LedgerRangeQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'ISO 8601, inclusive.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'ISO 8601, inclusive.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class AdminLedgerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only this store’s entries.' })
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'ISO 8601, inclusive.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'ISO 8601, inclusive.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
