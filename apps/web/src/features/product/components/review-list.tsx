import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Pagination } from '../../../components/pagination';
import { Skeleton } from '../../../components/skeleton';
import { formatDateTime } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { fetchReviews } from '../product-api';

const PAGE_SIZE = 5;

export function ReviewList({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const reviews = useQuery({
    queryKey: queryKeys.reviews(productId, page),
    queryFn: () => fetchReviews(productId, page),
  });

  if (reviews.isPending) {
    return <Skeleton className="h-24" />;
  }
  if (reviews.isError) {
    return <ErrorState message="Could not load reviews." onRetry={() => void reviews.refetch()} />;
  }
  if (reviews.data.total === 0) {
    return (
      <EmptyState title="No reviews yet" detail="Buyers can review a product after receiving it." />
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {reviews.data.items.map((review) => (
          <li key={review.id} className="rounded-md border border-line p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{review.authorName}</span>
              <span className="text-xs text-muted">{formatDateTime(review.createdAt)}</span>
            </div>
            <p className="text-warn" aria-label={`${review.rating} of 5`}>
              {'★'.repeat(review.rating)}
              <span className="text-slate-300">{'★'.repeat(5 - review.rating)}</span>
            </p>
            <p className="mt-1">{review.text}</p>
          </li>
        ))}
      </ul>
      <Pagination page={page} limit={PAGE_SIZE} total={reviews.data.total} onPageChange={setPage} />
    </div>
  );
}
