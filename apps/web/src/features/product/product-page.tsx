import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';

import { Card } from '../../components/card';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { RatingStars } from '../../components/product-card';
import { Skeleton } from '../../components/skeleton';
import { isApiError } from '../../lib/api/errors';
import { queryKeys } from '../../lib/query-keys';

import { AddToCart } from './components/add-to-cart';
import { BidPanel } from './components/bid-panel';
import { ReviewList } from './components/review-list';
import { SimilarProducts } from './components/similar-products';
import { StockIndicator } from './components/stock-indicator';
import { fetchProduct, type ProductDetails } from './product-api';
import { useLiveStock } from './use-live-stock';

function FixedPriceBlock({ product }: { product: ProductDetails }) {
  const stock = useLiveStock(product.id, product.stock);
  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <p className="text-3xl font-semibold">
          {product.priceCents !== null ? <Money cents={product.priceCents} /> : '—'}
        </p>
        <StockIndicator stock={stock} />
      </div>
      <AddToCart productId={product.id} stock={stock} />
    </Card>
  );
}

export function ProductPage() {
  const { id = '' } = useParams();
  const product = useQuery({
    queryKey: queryKeys.product(id),
    queryFn: () => fetchProduct(id),
  });

  if (product.isPending) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (product.isError) {
    const missing = isApiError(product.error) && product.error.status === 404;
    return (
      <ErrorState
        message={
          missing
            ? 'This product does not exist or is no longer available.'
            : 'Could not load the product.'
        }
        {...(missing ? {} : { onRetry: () => void product.refetch() })}
      />
    );
  }

  const data = product.data;
  const image = data.images[0];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        {image ? (
          <img src={image} alt={data.title} className="max-h-96 w-full rounded-lg object-cover" />
        ) : (
          <div className="flex h-80 items-center justify-center rounded-lg bg-slate-100 text-muted">
            No image
          </div>
        )}
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{data.title}</h1>
            <p className="text-sm text-muted">
              {data.seller.storeName} · {data.category.name}
            </p>
            <RatingStars average={data.rating.average} count={data.rating.count} />
          </div>
          {data.type === 'AUCTION' && data.auction ? (
            <BidPanel auctionId={data.auction.id} />
          ) : (
            <FixedPriceBlock product={data} />
          )}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Description</h2>
        <p className="whitespace-pre-line text-sm">{data.description}</p>
      </section>

      <section className="space-y-3" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="text-lg font-semibold">
          Reviews
        </h2>
        <ReviewList productId={data.id} />
      </section>

      <SimilarProducts productId={data.id} />
    </div>
  );
}
