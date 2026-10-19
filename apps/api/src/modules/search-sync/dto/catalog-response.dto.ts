import { ApiProperty } from '@nestjs/swagger';

import { CATALOG_PRODUCT_TYPES, type CatalogProductType } from '../../../search';
import type { CatalogPage } from '../catalog-page';

class RatingDto {
  @ApiProperty()
  average: number;

  @ApiProperty()
  count: number;
}

class IdNameDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

class IdNameCountDto extends IdNameDto {
  @ApiProperty()
  count: number;
}

class TypeFacetDto {
  @ApiProperty({ enum: CATALOG_PRODUCT_TYPES })
  value: string;

  @ApiProperty()
  count: number;
}

class InStockFacetDto {
  @ApiProperty()
  value: boolean;

  @ApiProperty()
  count: number;
}

class PriceRangeDto {
  @ApiProperty({ description: 'Lowest price among all matches, in cents.' })
  min: number;

  @ApiProperty({ description: 'Highest price among all matches, in cents.' })
  max: number;
}

class CatalogFacetsDto {
  @ApiProperty({ type: [IdNameCountDto] })
  categories: IdNameCountDto[];

  @ApiProperty({ type: [IdNameCountDto] })
  sellers: IdNameCountDto[];

  @ApiProperty({ type: [TypeFacetDto] })
  types: TypeFacetDto[];

  @ApiProperty({ type: [InStockFacetDto] })
  inStock: InStockFacetDto[];
}

export class CatalogItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: CATALOG_PRODUCT_TYPES })
  type: CatalogProductType;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ type: Number, nullable: true })
  priceCents: number | null;

  @ApiProperty()
  inStock: boolean;

  @ApiProperty()
  stock: number;

  @ApiProperty({ type: RatingDto })
  rating: RatingDto;

  @ApiProperty({ type: IdNameDto })
  seller: IdNameDto;

  @ApiProperty({ type: IdNameDto })
  category: IdNameDto;
}

export class CatalogPageDto {
  @ApiProperty({ type: [CatalogItemDto] })
  items: CatalogItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty({ type: CatalogFacetsDto })
  facets: CatalogFacetsDto;

  @ApiProperty({ type: PriceRangeDto, nullable: true })
  priceRange: PriceRangeDto | null;

  @ApiProperty({ description: 'True when the SQL fallback answered, with fewer facets.' })
  degraded: boolean;

  static from(page: CatalogPage): CatalogPageDto {
    return {
      items: page.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        imageUrl: item.imageUrl,
        priceCents: item.priceCents,
        inStock: item.inStock,
        stock: item.stock,
        rating: { average: item.ratingAvg, count: item.ratingCount },
        seller: { id: item.sellerId, name: item.sellerName },
        category: { id: item.categoryId, name: item.categoryName },
      })),
      total: page.total,
      page: page.page,
      limit: page.limit,
      facets: {
        categories: page.facets.categories.map((facet) => ({ ...facet })),
        sellers: page.facets.sellers.map((facet) => ({ ...facet })),
        types: page.facets.types.map((facet) => ({ ...facet })),
        inStock: page.facets.inStock.map((facet) => ({ ...facet })),
      },
      priceRange: page.priceRange ? { ...page.priceRange } : null,
      degraded: page.degraded,
    };
  }
}
