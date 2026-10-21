import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Pagination } from '../../components/pagination';
import { PeriodForm } from '../../components/period-form';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { Table } from '../../components/table';
import { formatDateTime } from '../../lib/format';
import { dayRangeToIso } from '../../lib/period-range';
import { queryKeys } from '../../lib/query-keys';

import { fetchApprovedStores, fetchLedger, LEDGER_PAGE_SIZE } from './admin-api';
import { defaultPeriod } from './period';

const TYPE_LABELS: Record<string, string> = {
  SALE: 'Sale',
  COMMISSION: 'Commission',
  REFUND: 'Refund',
  COMMISSION_REVERSAL: 'Commission reversal',
  CANCELLATION: 'Cancellation',
  PAYOUT: 'Payout',
};

export function LedgerPage() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [sellerId, setSellerId] = useState('');
  const [page, setPage] = useState(1);
  const filters = {
    page,
    ...dayRangeToIso(period),
    ...(sellerId !== '' && { sellerId }),
  };

  const stores = useQuery({ queryKey: ['admin', 'stores'], queryFn: fetchApprovedStores });
  const ledger = useQuery({
    queryKey: queryKeys.adminLedger({ ...period, sellerId, page }),
    queryFn: () => fetchLedger(filters),
  });
  const storeName = (id: string) =>
    stores.data?.items.find((store) => store.id === id)?.storeName ?? id.slice(0, 8);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ledger</h1>
      <PeriodForm
        initial={period}
        onApply={(next) => {
          setPeriod(next);
          setPage(1);
        }}
      >
        <Select
          label="Store"
          value={sellerId}
          onChange={(event) => {
            setSellerId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All stores</option>
          {stores.data?.items.map((store) => (
            <option key={store.id} value={store.id}>
              {store.storeName}
            </option>
          ))}
        </Select>
      </PeriodForm>

      {ledger.isPending ? <Skeleton className="h-48" /> : null}
      {ledger.isError ? (
        <ErrorState message="Could not load the ledger." onRetry={() => void ledger.refetch()} />
      ) : null}
      {ledger.data?.items.length === 0 ? <EmptyState title="No ledger entries" /> : null}
      {ledger.data !== undefined && ledger.data.items.length > 0 ? (
        <>
          <Table headers={['Date', 'Store', 'Type', 'Amount', 'Seller order']}>
            {ledger.data.items.map((entry) => (
              <tr key={entry.id} className="border-b border-line">
                <td className="px-3 py-2">{formatDateTime(entry.createdAt)}</td>
                <td className="px-3 py-2">{storeName(entry.sellerId)}</td>
                <td className="px-3 py-2">{TYPE_LABELS[entry.type] ?? entry.type}</td>
                <td className={`px-3 py-2 ${entry.amountCents < 0 ? 'text-danger' : 'text-ok'}`}>
                  <Money cents={entry.amountCents} />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted">
                  {entry.sellerOrderId.slice(0, 8)}
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={page}
            limit={LEDGER_PAGE_SIZE}
            total={ledger.data.total}
            onPageChange={setPage}
          />
        </>
      ) : null}
    </div>
  );
}
