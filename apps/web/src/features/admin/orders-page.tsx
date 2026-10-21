import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';

import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Pagination } from '../../components/pagination';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { OrderStatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import { fetchAdminOrders, type OrderStatus } from './admin-api';

const PAGE_SIZE = 10;
const STATUSES: readonly OrderStatus[] = [
  'NEW',
  'PROCESSING',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
];

export function AdminOrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.find((value) => value === params.get('status'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filters = { page, ...(status !== undefined && { status }) };
  const orders = useQuery({
    queryKey: queryKeys.adminOrders(filters),
    queryFn: () => fetchAdminOrders(filters),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <Select
        label="Status"
        value={status ?? ''}
        onChange={(event) => {
          setParams(event.target.value === '' ? {} : { status: event.target.value });
        }}
      >
        <option value="">All</option>
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value.replaceAll('_', ' ').toLowerCase()}
          </option>
        ))}
      </Select>

      {orders.isPending ? <Skeleton className="h-48" /> : null}
      {orders.isError ? (
        <ErrorState message="Could not load orders." onRetry={() => void orders.refetch()} />
      ) : null}
      {orders.data?.items.length === 0 ? <EmptyState title="No orders found" /> : null}
      {orders.data !== undefined && orders.data.items.length > 0 ? (
        <>
          <Table headers={['Placed', 'Shipments', 'Status', 'Total', '']}>
            {orders.data.items.map((order) => (
              <tr key={order.id} className="border-b border-line">
                <td className="px-3 py-2">{formatDateTime(order.createdAt)}</td>
                <td className="px-3 py-2">{order.sellerOrders.length}</td>
                <td className="px-3 py-2">
                  <OrderStatusBadge
                    status={order.status}
                    hasCancelledParts={order.hasCancelledParts}
                  />
                </td>
                <td className="px-3 py-2">
                  <Money cents={order.totalCents} />
                </td>
                <td className="px-3 py-2">
                  <Link to={`/admin/orders/${order.id}`} className="text-brand">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={orders.data.total}
            onPageChange={(next) => {
              setParams({ ...(status !== undefined && { status }), page: String(next) });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
