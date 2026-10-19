import { ApiProperty } from '@nestjs/swagger';

import { PRODUCT_TYPES, type Product, type ProductType } from '../product';

class RatingDto {
  @ApiProperty({ description: 'Average rating, two decimals.' })
  average: number;

  @ApiProperty()
  count: number;
}

class ProductSellerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  storeName: string;
}

class ProductCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

/** The public product page. Plain JSON on purpose: it is stored in the cache as is. */
export class ProductDetailsResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PRODUCT_TYPES })
  type: ProductType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ type: Number, nullable: true })
  priceCents: number | null;

  @ApiProperty()
  stock: number;

  @ApiProperty()
  inStock: boolean;

  @ApiProperty()
  version: number;

  @ApiProperty({ type: RatingDto })
  rating: RatingDto;

  @ApiProperty({ type: ProductSellerDto })
  seller: ProductSellerDto;

  @ApiProperty({ type: ProductCategoryDto })
  category: ProductCategoryDto;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(
    product: Product,
    seller: { id: string; storeName: string },
    category: { id: string; name: string; slug: string },
  ): ProductDetailsResponseDto {
    return {
      id: product.id,
      type: product.type,
      title: product.title,
      description: product.description,
      images: [...product.images],
      priceCents: product.priceCents,
      stock: product.stock,
      inStock: product.stock > 0,
      version: product.version,
      rating: { average: product.ratingAvg, count: product.ratingCount },
      seller: { id: seller.id, storeName: seller.storeName },
      category: { id: category.id, name: category.name, slug: category.slug },
      createdAt: product.createdAt.toISOString(),
    };
  }
}

export class ProductStockResponseDto {
  @ApiProperty()
  stock: number;

  @ApiProperty()
  inStock: boolean;

  @ApiProperty()
  version: number;

  static from(product: Product): ProductStockResponseDto {
    return { stock: product.stock, inStock: product.stock > 0, version: product.version };
  }
}

export class ProductSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PRODUCT_TYPES })
  type: ProductType;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  image: string | null;

  @ApiProperty({ type: Number, nullable: true })
  priceCents: number | null;

  @ApiProperty()
  inStock: boolean;

  @ApiProperty({ type: RatingDto })
  rating: RatingDto;

  static from(product: Product): ProductSummaryResponseDto {
    return {
      id: product.id,
      type: product.type,
      title: product.title,
      image: product.images[0] ?? null,
      priceCents: product.priceCents,
      inStock: product.stock > 0,
      rating: { average: product.ratingAvg, count: product.ratingCount },
    };
  }
}
