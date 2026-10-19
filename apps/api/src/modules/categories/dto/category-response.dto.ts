import { ApiProperty } from '@nestjs/swagger';

import type { Category } from '../category';

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentId: string | null;

  static from(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
    };
  }
}
