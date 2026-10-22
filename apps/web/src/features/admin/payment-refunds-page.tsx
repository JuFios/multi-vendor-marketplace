import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';

import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Pagination } from '../../components/pagination';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { Table } from '../../components/table';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import {
  fetchApprovedStores,
  fetchPaymentRefunds,
  PAYMENT_REFUNDS_PAGE_SIZE,
  type PaymentRefundStatus,
} from './admin-api';

/** `?status=` values; without one the page shows the refused refunds, which need a person. */
const FILTERS = ['FAILED', 'REFUNDED', 'all'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  FAILED: 'Refused by the gateway',
  REFUNDED: 'Paid back',
  all: 'All',
};

const STATUS_LABELS: Record<PaymentRefundStatus, { text: string; className: string }> = {
  FAILED: { text: 'Refused', className: 'text-danger' },
  REFUNDED: { text: 'Paid back', className: 'text-ok' },
};

export function PaymentRefundsPage() {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.find((value) => value === params.get('status')) ?? 'FAILED';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filters = { page, ...(filter !== 'all' && { status: filter }) };

  const stores = useQuery({ queryKey: ['admin', 'stores'], queryFn: fetchApprovedStores });
  const refunds = useQuery({
    queryKey: queryKeys.adminPaymentRefunds(filters),
    queryFn: () => fetchPaymentRefunds(filters),
  });
  const storeName = (id: string) =>
    stores.data?.items.find((store) => store.id === id)?.storeName ?? id.slice(0, 8);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Gateway refunds</h1>
      <p className="text-sm text-muted">
        What the payment gateway answered when money went back to a buyer. A refused refund is
        already booked as returned, so it has to be settled with the provider by hand.
      </p>
      <Select
        label="Outcome"
        value={filter}
        onChange={(event) => {
          setParams(event.target.value === 'FAILED' ? {} : { status: event.target.value });
        }}
      >
        {FILTERS.map((value) => (
          <option key={value} value={value}>
            {FILTER_LABELS[value]}
          </option>
        ))}
      </Select>

      {refunds.isPending ? <Skeleton className="h-48" /> : null}
      {refunds.isError ? (
        <ErrorState
          message="Could not load the gateway refunds."
          onRetry={() => void refunds.refetch()}
        />
      ) : null}
      {refunds.data?.items.length === 0 ? (
        <EmptyState
          title={filter === 'FAILED' ? 'No refused refunds' : 'No gateway refunds'}
          {...(filter === 'FAILED' && { detail: 'The gateway has not refused any refund.' })}
        />
      ) : null}
      {refunds.data !== undefined && refunds.data.items.length > 0 ? (
        <>
          <Table headers={['Date', 'Store', 'Amount', 'Outcome', 'Gateway answer', '']}>
            {refunds.data.items.map((refund) => {
              const status = STATUS_LABELS[refund.status];
              return (
                <tr key={refund.id} className="border-b border-line">
                  <td className="px-3 py-2">{formatDateTime(refund.createdAt)}</td>
                  <td className="px-3 py-2">{storeName(refund.sellerId)}</td>
                  <td className="px-3 py-2">
                    <Money cents={refund.amountCents} />
                  </td>
                  <td className={`px-3 py-2 ${status.className}`}>{status.text}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {refund.failureReason ?? refund.providerRef ?? ''}
                  </td>
                  <td className="px-3 py-2">
                    <Link to={`/admin/orders/${refund.orderId}`} className="text-brand">
                      Open order
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
          <Pagination
            page={page}
            limit={PAYMENT_REFUNDS_PAGE_SIZE}
            total={refunds.data.total}
            onPageChange={(next) => {
              setParams({ ...(filter !== 'FAILED' && { status: filter }), page: String(next) });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
