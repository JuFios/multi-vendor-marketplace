import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Pagination } from '../../components/pagination';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import { fetchSellerAuctions } from './seller-api';

const PAGE_SIZE = 10;

export function SellerAuctionsPage() {
  const [page, setPage] = useState(1);
  const auctions = useQuery({
    queryKey: queryKeys.sellerAuctions({ page }),
    queryFn: () => fetchSellerAuctions(page),
  });

  if (auctions.isPending) {
    return <Skeleton className="h-48" />;
  }
  if (auctions.isError) {
    return (
      <ErrorState message="Could not load auctions." onRetry={() => void auctions.refetch()} />
    );
  }
  if (auctions.data.total === 0) {
    return (
      <EmptyState title="No auction lots" detail="Create a product of type Auction to start one." />
    );
  }
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Auctions</h1>
      <Table headers={['Lot', 'Status', 'Round', 'Current bid', 'Bids', 'Ends']}>
        {auctions.data.items.map((auction) => (
          <tr key={auction.id} className="border-b border-line">
            <td className="px-3 py-2">
              <Link to={`/products/${auction.productId}`} className="text-brand">
                View lot
              </Link>
            </td>
            <td className="px-3 py-2">
              <StatusBadge status={auction.status} />
            </td>
            <td className="px-3 py-2">{auction.round}</td>
            <td className="px-3 py-2">
              <Money cents={auction.currentPriceCents ?? auction.startPriceCents} />
            </td>
            <td className="px-3 py-2">{auction.bidCount}</td>
            <td className="px-3 py-2">{formatDateTime(auction.endsAt)}</td>
          </tr>
        ))}
      </Table>
      <Pagination
        page={page}
        limit={PAGE_SIZE}
        total={auctions.data.total}
        onPageChange={setPage}
      />
    </div>
  );
}
