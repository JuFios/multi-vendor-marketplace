import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState } from '../../components/error-state';
import { KpiCard } from '../../components/kpi-card';
import { Money } from '../../components/money';
import { PeriodForm } from '../../components/period-form';
import { Skeleton } from '../../components/skeleton';
import { dayRangeToIso } from '../../lib/period-range';
import { queryKeys } from '../../lib/query-keys';
import { defaultPeriod } from '../admin/period';

import { fetchSellerFinance } from './seller-api';

export function SellerFinancePage() {
  const [period, setPeriod] = useState(defaultPeriod);
  const range = dayRangeToIso(period);
  const finance = useQuery({
    queryKey: queryKeys.sellerFinance(period),
    queryFn: () => fetchSellerFinance(range),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Finance</h1>
      <PeriodForm initial={period} onApply={setPeriod} />

      {finance.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : null}
      {finance.isError ? (
        <ErrorState message="Could not load the finances." onRetry={() => void finance.refetch()} />
      ) : null}
      {finance.data !== undefined ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Gross sales" value={<Money cents={finance.data.grossCents} />} />
            <KpiCard
              label="Refunds"
              value={<Money cents={finance.data.refundsCents} />}
              tone="negative"
            />
            <KpiCard
              label="Platform commission"
              value={<Money cents={finance.data.commissionCents} />}
            />
            <KpiCard
              label="Net revenue"
              value={<Money cents={finance.data.netCents} />}
              tone="positive"
              hint="Gross sales minus refunds and commission"
            />
            <KpiCard label="Paid out" value={<Money cents={finance.data.paidOutCents} />} />
            <KpiCard
              label="Balance"
              value={<Money cents={finance.data.balanceCents} />}
              hint="What the platform owes your store now, over all time"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
