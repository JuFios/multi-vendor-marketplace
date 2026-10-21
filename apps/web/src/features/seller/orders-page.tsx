import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';

import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Pagination } from '../../components/pagination';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import { fetchSellerOrders, type SellerOrderStatus } from './seller-api';

const PAGE_SIZE = 10;
const STATUSES: readonly SellerOrderStatus[] = [
  'NEW',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
];

export function SellerOrdersPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('status');
  const status = STATUSES.find((candidate) => candidate === requested);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filters = { page, ...(status !== undefined && { status }) };
  const orders = useQuery({
    queryKey: queryKeys.sellerOrders(filters),
    queryFn: () => fetchSellerOrders(filters),
  });

  const update = (patch: Record<string, string>) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) {
        if (value === '') {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <Select
        label="Status"
        value={status ?? ''}
        onChange={(event) => {
          update({ status: event.target.value, page: '' });
        }}
      >
        <option value="">All</option>
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value.charAt(0) + value.slice(1).toLowerCase()}
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
          <Table headers={['Placed', 'Items', 'Status', 'Payment', 'Subtotal', '']}>
            {orders.data.items.map((order) => (
              <tr key={order.id} className="border-b border-line">
                <td className="px-3 py-2">{formatDateTime(order.createdAt)}</td>
                <td className="px-3 py-2">
                  {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-3 py-2">{order.paymentStatus.toLowerCase()}</td>
                <td className="px-3 py-2">
                  <Money cents={order.subtotalCents} />
                </td>
                <td className="px-3 py-2">
                  <Link to={`/seller/orders/${order.id}`} className="text-brand">
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
              update({ page: String(next) });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
