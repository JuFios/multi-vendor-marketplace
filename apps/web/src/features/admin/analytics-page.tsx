import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Input } from '../../components/input';
import { KpiCard } from '../../components/kpi-card';
import { Money } from '../../components/money';
import { SalesChart } from '../../components/sales-chart';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { Table } from '../../components/table';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { saveBlob } from '../../lib/download';
import { queryKeys } from '../../lib/query-keys';

import {
  downloadReport,
  fetchAnalyticsSummary,
  fetchSalesChart,
  type ReportFormat,
} from './admin-api';
import { formatDelta, METRIC_LABELS, type ChartMetric } from './chart-model';
import { defaultPeriod } from './period';

const CHART_DAYS = 30;

export function AnalyticsPage() {
  const toast = useToast();
  const [draft, setDraft] = useState(defaultPeriod);
  const [period, setPeriod] = useState(draft);
  const [metric, setMetric] = useState<ChartMetric>('grossCents');
  const periodValid = draft.from !== '' && draft.to !== '' && draft.from <= draft.to;

  const summary = useQuery({
    queryKey: queryKeys.adminAnalytics(period),
    queryFn: () => fetchAnalyticsSummary(period),
  });
  const chart = useQuery({
    queryKey: queryKeys.adminChart(CHART_DAYS),
    queryFn: () => fetchSalesChart(CHART_DAYS),
  });

  const download = useMutation({
    mutationFn: (format: ReportFormat) => downloadReport({ ...period, format }),
    onSuccess: ({ blob, filename }) => {
      saveBlob(blob, filename);
    },
    onError: (error) => {
      toast.push(errorMessage(error), 'error');
    },
  });

  const totals = chart.data?.totals;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (periodValid) {
            setPeriod(draft);
          }
        }}
      >
        <Input
          label="From"
          type="date"
          value={draft.from}
          max={draft.to}
          onChange={(event) => {
            setDraft((current) => ({ ...current, from: event.target.value }));
          }}
        />
        <Input
          label="To"
          type="date"
          value={draft.to}
          min={draft.from}
          onChange={(event) => {
            setDraft((current) => ({ ...current, to: event.target.value }));
          }}
        />
        <Button type="submit" disabled={!periodValid}>
          Apply
        </Button>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            loading={download.isPending && download.variables === 'csv'}
            onClick={() => {
              download.mutate('csv');
            }}
          >
            Export CSV
          </Button>
          <Button
            variant="secondary"
            loading={download.isPending && download.variables === 'json'}
            onClick={() => {
              download.mutate('json');
            }}
          >
            Export JSON
          </Button>
        </div>
      </form>

      {summary.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : null}
      {summary.isError ? (
        <ErrorState message="Could not load the summary." onRetry={() => void summary.refetch()} />
      ) : null}
      {summary.data !== undefined ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Platform revenue"
              value={<Money cents={summary.data.platformRevenueCents} />}
              tone="positive"
            />
            <KpiCard label="Gross sales" value={<Money cents={summary.data.grossSalesCents} />} />
            <KpiCard label="Orders" value={summary.data.ordersCount} />
            <KpiCard
              label="Cart conversion"
              value={`${(summary.data.conversion.rate * 100).toFixed(1)}%`}
              hint={`${summary.data.conversion.convertedCarts} of ${summary.data.conversion.cartsWithItems} carts`}
            />
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Revenue by seller</h2>
            {summary.data.revenueBySeller.length === 0 ? (
              <EmptyState title="No sales in this period" />
            ) : (
              <Table headers={['Seller', 'Orders', 'Gross', 'Refunded', 'Commission', 'Net']}>
                {summary.data.revenueBySeller.map((row) => (
                  <tr key={row.sellerId} className="border-b border-line">
                    <td className="px-3 py-2">{row.storeName}</td>
                    <td className="px-3 py-2">{row.ordersCount}</td>
                    <td className="px-3 py-2">
                      <Money cents={row.grossCents} />
                    </td>
                    <td className="px-3 py-2">
                      <Money cents={row.refundedCents} />
                    </td>
                    <td className="px-3 py-2">
                      <Money cents={row.commissionCents} />
                    </td>
                    <td className="px-3 py-2">
                      <Money cents={row.netCents} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Top products</h2>
              <Card>
                <ol className="divide-y divide-line text-sm">
                  {summary.data.topProducts.map((product) => (
                    <li key={product.productId} className="flex justify-between gap-2 py-2">
                      <span>
                        {product.title}
                        <span className="ml-2 text-xs text-muted">{product.quantity} sold</span>
                      </span>
                      <Money cents={product.revenueCents} />
                    </li>
                  ))}
                  {summary.data.topProducts.length === 0 ? (
                    <li className="py-2 text-muted">No data</li>
                  ) : null}
                </ol>
              </Card>
            </section>
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Top sellers</h2>
              <Card>
                <ol className="divide-y divide-line text-sm">
                  {summary.data.topSellers.map((seller) => (
                    <li key={seller.sellerId} className="flex justify-between gap-2 py-2">
                      <span>
                        {seller.storeName}
                        <span className="ml-2 text-xs text-muted">{seller.ordersCount} orders</span>
                      </span>
                      <Money cents={seller.revenueCents} />
                    </li>
                  ))}
                  {summary.data.topSellers.length === 0 ? (
                    <li className="py-2 text-muted">No data</li>
                  ) : null}
                </ol>
              </Card>
            </section>
          </div>
        </>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Last {CHART_DAYS} days against the previous {CHART_DAYS}
          </h2>
          <Select
            label="Metric"
            value={metric}
            onChange={(event) => {
              setMetric(event.target.value as ChartMetric);
            }}
          >
            {Object.entries(METRIC_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {totals !== undefined ? (
          <p className="text-sm text-muted">
            Change in {METRIC_LABELS[metric].toLowerCase()}:{' '}
            <strong>{formatDelta(totals.deltaPct[metric])}</strong>
          </p>
        ) : null}
        {chart.isPending ? <Skeleton className="h-80" /> : null}
        {chart.isError ? (
          <ErrorState message="Could not load the chart." onRetry={() => void chart.refetch()} />
        ) : null}
        {chart.data !== undefined ? (
          <Card>
            <SalesChart data={chart.data} metric={metric} />
          </Card>
        ) : null}
      </section>
    </div>
  );
}
