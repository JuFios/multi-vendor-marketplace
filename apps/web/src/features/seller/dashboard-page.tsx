import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { KpiCard } from '../../components/kpi-card';
import { Money } from '../../components/money';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import { LiveLotRow } from './components/live-lot-row';
import { fetchSellerDashboard } from './seller-api';

const STATUSES = ['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const;

export function SellerDashboardPage() {
  const dashboard = useQuery({
    queryKey: queryKeys.sellerDashboard({}),
    queryFn: fetchSellerDashboard,
  });

  if (dashboard.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    );
  }
  if (dashboard.isError) {
    return (
      <ErrorState
        message="Could not load the dashboard."
        onRetry={() => void dashboard.refetch()}
      />
    );
  }
  const { revenue, ordersByStatus, recentOrders, activeLots } = dashboard.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Gross sales"
          value={<Money cents={revenue.grossCents} />}
          hint={`${revenue.ordersCount} orders`}
        />
        <KpiCard label="Net revenue" value={<Money cents={revenue.netCents} />} tone="positive" />
        <KpiCard label="Platform commission" value={<Money cents={revenue.commissionCents} />} />
        <KpiCard label="Refunds" value={<Money cents={revenue.refundsCents} />} tone="negative" />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Orders by status</h2>
        <ul className="flex flex-wrap gap-3">
          {STATUSES.map((status) => (
            <li
              key={status}
              className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2"
            >
              <StatusBadge status={status} />
              <span className="font-semibold tabular-nums">{ordersByStatus[status]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Active auction lots</h2>
        {activeLots.length === 0 ? (
          <EmptyState title="No active lots" />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {activeLots.map((lot) => (
                <LiveLotRow
                  key={lot.auctionId}
                  auctionId={lot.auctionId}
                  productId={lot.productId}
                  title={lot.title}
                  currentPriceCents={lot.currentPriceCents}
                  bidCount={lot.bidCount}
                  endsAt={lot.endsAt}
                  serverTime={new Date(dashboard.dataUpdatedAt).toISOString()}
                />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recent orders</h2>
        {recentOrders.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <Table headers={['Placed', 'Status', 'Subtotal', '']}>
            {recentOrders.map((order) => (
              <tr key={order.id} className="border-b border-line">
                <td className="px-3 py-2">{formatDateTime(order.createdAt)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={order.status} />
                </td>
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
        )}
      </section>
    </div>
  );
}
