import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Pagination } from '../../components/pagination';
import { Skeleton } from '../../components/skeleton';
import { OrderStatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import { fetchOrders } from './orders-api';

const PAGE_SIZE = 10;

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: queryKeys.orders({ page }),
    queryFn: () => fetchOrders(page),
  });

  if (orders.isPending) {
    return <Skeleton className="h-48" />;
  }
  if (orders.isError) {
    return (
      <ErrorState message="Could not load your orders." onRetry={() => void orders.refetch()} />
    );
  }
  if (orders.data.total === 0) {
    return (
      <div className="space-y-3 text-center">
        <EmptyState title="No orders yet" detail="Orders you place appear here." />
        <Link to="/" className="text-sm font-medium text-brand">
          Browse the catalog
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">My orders</h1>
      <Table headers={['Placed', 'Shipments', 'Status', 'Total', '']}>
        {orders.data.items.map((order) => (
          <tr key={order.id} className="border-b border-line">
            <td className="px-3 py-2">{formatDateTime(order.createdAt)}</td>
            <td className="px-3 py-2">{order.sellerOrders.length}</td>
            <td className="px-3 py-2">
              <OrderStatusBadge status={order.status} hasCancelledParts={order.hasCancelledParts} />
            </td>
            <td className="px-3 py-2">
              <Money cents={order.totalCents} />
            </td>
            <td className="px-3 py-2">
              <Link to={`/account/orders/${order.id}`} className="text-brand">
                Details
              </Link>
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} limit={PAGE_SIZE} total={orders.data.total} onPageChange={setPage} />
    </div>
  );
}
