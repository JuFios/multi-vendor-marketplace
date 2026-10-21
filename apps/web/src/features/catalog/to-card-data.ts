import type { ProductCardData } from '../../components/product-card';

import type { CatalogItem } from './catalog-api';

export function toCardData(item: CatalogItem): ProductCardData {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    imageUrl: item.imageUrl,
    priceCents: item.priceCents,
    inStock: item.inStock,
    ratingAverage: item.rating.average,
    ratingCount: item.rating.count,
    sellerName: item.seller.name,
    auctionStatus: item.auctionStatus,
  };
}
