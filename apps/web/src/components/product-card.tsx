import { Link } from 'react-router';

import { Card } from './card';
import { Money } from './money';
import { StatusBadge } from './status-badge';

export interface ProductCardData {
  id: string;
  type: 'FIXED_PRICE' | 'AUCTION';
  title: string;
  imageUrl?: string | null | undefined;
  priceCents?: number | null | undefined;
  inStock: boolean;
  ratingAverage: number;
  ratingCount: number;
  sellerName?: string | undefined;
  auctionStatus?: string | null | undefined;
}

export function RatingStars({ average, count }: { average: number; count: number }) {
  if (count === 0) {
    return <span className="text-xs text-muted">No reviews yet</span>;
  }
  return (
    <span className="text-xs text-muted" aria-label={`Rating ${average.toFixed(1)} of 5`}>
      ★ {average.toFixed(1)} ({count})
    </span>
  );
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const isAuction = product.type === 'AUCTION';
  return (
    <Link to={`/products/${product.id}`} className="block h-full">
      <Card className="flex h-full flex-col gap-2 transition hover:shadow-md">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            className="h-40 w-full rounded-md object-cover"
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-md bg-slate-100 text-sm text-muted">
            No image
          </div>
        )}
        <h3 className="line-clamp-2 font-medium">{product.title}</h3>
        {product.sellerName !== undefined ? (
          <p className="text-xs text-muted">{product.sellerName}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="font-semibold">
            {product.priceCents != null ? <Money cents={product.priceCents} /> : '—'}
            {isAuction ? <span className="ml-1 text-xs font-normal text-muted">bid</span> : null}
          </span>
          <RatingStars average={product.ratingAverage} count={product.ratingCount} />
        </div>
        <div className="flex flex-wrap gap-1">
          {isAuction ? <StatusBadge status={product.auctionStatus ?? 'ACTIVE'} /> : null}
          {!isAuction && !product.inStock ? (
            <span className="text-xs text-danger">Out of stock</span>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
