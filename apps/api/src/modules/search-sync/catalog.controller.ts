import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../../common/decorators';
import { ApiErrorResponses } from '../../common/swagger';

import { CatalogService } from './catalog.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CatalogPageDto } from './dto/catalog-response.dto';

export const SEARCH_DEGRADED_HEADER = 'X-Search-Degraded';

@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Search and filter published products, with facets.' })
  @ApiOkResponse({
    type: CatalogPageDto,
    headers: {
      [SEARCH_DEGRADED_HEADER]: {
        description: 'Set to 1 when the SQL fallback answered instead of the search index.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiErrorResponses(400, 429)
  async find(
    @Query() query: CatalogQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CatalogPageDto> {
    const page = await this.catalog.find(query);
    if (page.degraded) {
      response.setHeader(SEARCH_DEGRADED_HEADER, '1');
    }
    return CatalogPageDto.from(page);
  }
}
