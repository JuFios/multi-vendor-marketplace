import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto';
import { MODERATION_STATUSES, type ModerationStatus } from '../product';

export class ListModerationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MODERATION_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsEnum(MODERATION_STATUSES)
  status: ModerationStatus = 'PENDING';
}
