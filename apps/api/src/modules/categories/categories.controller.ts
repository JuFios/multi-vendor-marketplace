import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators';

import { CategoriesService } from './categories.service';
import { CategoryResponseDto } from './dto/category-response.dto';

@ApiTags('categories')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'All categories as a flat list; `parentId` describes the tree.' })
  @ApiOkResponse({ type: [CategoryResponseDto] })
  async list(): Promise<CategoryResponseDto[]> {
    return (await this.categories.list()).map((category) => CategoryResponseDto.from(category));
  }
}
