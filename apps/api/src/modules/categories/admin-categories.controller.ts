import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ParseUuidPipe } from '../../common/pipes';
import { ApiErrorResponses, BEARER_AUTH } from '../../common/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

import { CategoriesService } from './categories.service';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('admin')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a category.' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiErrorResponses(400, 401, 403, 409)
  async create(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.categories.create(admin.userId, {
      name: dto.name,
      slug: dto.slug,
      parentId: dto.parentId ?? null,
    });
    return CategoryResponseDto.from(category);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, re-slug or move a category.' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async update(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.categories.update(admin.userId, id, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.slug === undefined ? {} : { slug: dto.slug }),
      ...(dto.parentId === undefined ? {} : { parentId: dto.parentId }),
    });
    return CategoryResponseDto.from(category);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a category.',
    description: 'Answers 409 CATEGORY_IN_USE while products or subcategories belong to it.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async remove(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<void> {
    await this.categories.delete(admin.userId, id);
  }
}
