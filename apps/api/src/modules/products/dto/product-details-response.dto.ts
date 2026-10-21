import { ApiProperty } from '@nestjs/swagger';

import { AUCTION_STATUSES, type AuctionStatus, type LotListing } from '../../bidding/auction';
import { PRODUCT_TYPES, publicListingOf, type Product, type ProductType } from '../product';

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

/** The lot behind an auction product, live: what a buyer needs to bid or to subscribe to it. */
class ProductAuctionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: AUCTION_STATUSES })
  status: AuctionStatus;

  @ApiProperty({ description: 'The leading bid, or the start price while nobody has bid.' })
  priceCents: number;

  @ApiProperty({ format: 'date-time' })
  endsAt: string;

  @ApiProperty({ description: 'True while the round still takes bids.' })
  open: boolean;
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

  @ApiProperty({ type: ProductAuctionDto, nullable: true })
  auction: ProductAuctionDto | null;

  /**
   * The page as the cache keeps it. A lot's price and availability belong to its auction, which
   * moves with every bid; `withLot` fills those in, so nothing stored here is served as final.
   */
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
      auction: null,
    };
  }
}

/** Applies the live state of the lot, so a bid shows at once instead of after the cache TTL. */
export function withLot(
  details: ProductDetailsResponseDto,
  lot: LotListing | undefined,
): ProductDetailsResponseDto {
  const listing = publicListingOf(details, lot);
  return {
    ...details,
    priceCents: listing.priceCents,
    inStock: listing.inStock,
    auction:
      listing.auction === null
        ? null
        : {
            id: listing.auction.auctionId,
            status: listing.auction.status,
            priceCents: listing.auction.priceCents,
            endsAt: listing.auction.endsAt.toISOString(),
            open: listing.auction.open,
          },
  };
}

export class ProductStockResponseDto {
  @ApiProperty()
  stock: number;

  @ApiProperty()
  inStock: boolean;

  @ApiProperty()
  version: number;

  static from(product: Product, lot: LotListing | undefined): ProductStockResponseDto {
    return {
      stock: product.stock,
      inStock: publicListingOf(product, lot).inStock,
      version: product.version,
    };
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

  static from(product: Product, lot: LotListing | undefined): ProductSummaryResponseDto {
    const listing = publicListingOf(product, lot);
    return {
      id: product.id,
      type: product.type,
      title: product.title,
      image: product.images[0] ?? null,
      priceCents: listing.priceCents,
      inStock: listing.inStock,
      rating: { average: product.ratingAvg, count: product.ratingCount },
    };
  }
}
