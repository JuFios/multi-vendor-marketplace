import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MAX_MONEY_CENTS } from '../../../common/money';
import {
  CATALOG_DEFAULT_LIMIT,
  CATALOG_MAX_LIMIT,
  CATALOG_PRODUCT_TYPES,
  CATALOG_SORTS,
  type CatalogProductType,
  type CatalogQuery,
  type CatalogSort,
} from '../../../search/catalog';

export const CATALOG_SEARCH_TEXT_MAX_LENGTH = 200;

/** `?q=&categoryId=&…`: every value is validated here, before it is used in any query. */
export class CatalogQueryDto implements CatalogQuery {
  @ApiPropertyOptional({ maxLength: CATALOG_SEARCH_TEXT_MAX_LENGTH, description: 'Search text.' })
  @Transform(({ value }: { value: unknown }) => {
    const text = typeof value === 'string' ? value.trim() : value;
    return text === '' ? undefined : text;
  })
  @IsOptional()
  @IsString()
  @MaxLength(CATALOG_SEARCH_TEXT_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'In cents.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_CENTS)
  priceMin?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'In cents.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_CENTS)
  priceMax?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  ratingMin?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ enum: CATALOG_PRODUCT_TYPES })
  @IsOptional()
  @IsEnum(CATALOG_PRODUCT_TYPES)
  type?: CatalogProductType;

  @ApiPropertyOptional({ enum: CATALOG_SORTS, default: 'relevance' })
  @IsOptional()
  @IsEnum(CATALOG_SORTS)
  sort: CatalogSort = 'relevance';

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: CATALOG_MAX_LIMIT, default: CATALOG_DEFAULT_LIMIT })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CATALOG_MAX_LIMIT)
  limit: number = CATALOG_DEFAULT_LIMIT;
}
