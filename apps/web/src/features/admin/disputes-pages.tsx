import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Pagination } from '../../components/pagination';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { isApiError } from '../../lib/api/errors';
import { IdempotencySession } from '../../lib/api/idempotency';
import { formatDate } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import { useSessionUser } from '../auth/use-session';
import { DisputeThread } from '../disputes/components/dispute-thread';
import { addDisputeMessage, fetchDispute } from '../disputes/disputes-api';

import {
  fetchAdminDisputes,
  fetchAdminOrder,
  resolveDispute,
  reviewDispute,
  type DisputeStatus,
  type ResolveBody,
} from './admin-api';
import { DisputeResolutionForm } from './components/dispute-resolution-form';

const PAGE_SIZE = 10;
const STATUSES: readonly DisputeStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED_BUYER_FAVOR',
  'RESOLVED_SELLER_FAVOR',
];

export function AdminDisputesPage() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.find((value) => value === params.get('status'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filters = { page, ...(status !== undefined && { status }) };
  const disputes = useQuery({
    queryKey: queryKeys.adminDisputes(filters),
    queryFn: () => fetchAdminDisputes(filters),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Disputes</h1>
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
      {disputes.isPending ? <Skeleton className="h-40" /> : null}
      {disputes.isError ? (
        <ErrorState message="Could not load disputes." onRetry={() => void disputes.refetch()} />
      ) : null}
      {disputes.data?.items.length === 0 ? <EmptyState title="No disputes" /> : null}
      {disputes.data !== undefined && disputes.data.items.length > 0 ? (
        <>
          <Table headers={['Opened', 'Reason', 'Status', '']}>
            {disputes.data.items.map((dispute) => (
              <tr key={dispute.id} className="border-b border-line">
                <td className="px-3 py-2">{formatDate(dispute.createdAt)}</td>
                <td className="max-w-sm truncate px-3 py-2">{dispute.reason}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={dispute.status} />
                </td>
                <td className="px-3 py-2">
                  <Link to={`/admin/disputes/${dispute.id}`} className="text-brand">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={disputes.data.total}
            onPageChange={(next) => {
              setParams({ ...(status !== undefined && { status }), page: String(next) });
            }}
          />
        </>
      ) : null}
    </div>
  );
}

export function AdminDisputeDetailsPage() {
  const { id = '' } = useParams();
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const attempt = useRef(new IdempotencySession());

  const dispute = useQuery({
    queryKey: queryKeys.adminDispute(id),
    queryFn: () => fetchDispute(id),
  });
  const orderId = dispute.data?.orderId;
  const order = useQuery({
    queryKey: queryKeys.adminOrder(orderId ?? ''),
    queryFn: () => fetchAdminOrder(orderId ?? ''),
    enabled: orderId !== undefined,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });
  const review = useMutation({
    mutationFn: () => reviewDispute(id),
    onSuccess: () => {
      toast.push('Dispute taken into review', 'ok');
      return refresh();
    },
    onError: (error) => {
      toast.push(errorMessage(error), 'error');
    },
  });
  const send = useMutation({
    mutationFn: (text: string) => addDisputeMessage({ disputeId: id, text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminDispute(id) }),
  });
  const resolve = useMutation({
    // A retry of the same decision after a network error reuses the key.
    mutationFn: (body: ResolveBody) => resolveDispute({ id, key: attempt.current.current(), body }),
    onSuccess: () => {
      attempt.current.reset();
      toast.push('Dispute resolved', 'ok');
      return refresh();
    },
    onError: (error) => {
      if (!isApiError(error) || error.status < 500) {
        attempt.current.reset();
      }
    },
  });

  if (dispute.isPending) {
    return <Skeleton className="h-64" />;
  }
  if (dispute.isError) {
    return (
      <ErrorState message="Could not load the dispute." onRetry={() => void dispute.refetch()} />
    );
  }
  const data = dispute.data;
  const sellerOrder = order.data?.sellerOrders.find(
    (candidate) => candidate.id === data.sellerOrderId,
  );
  const open = data.status === 'OPEN' || data.status === 'UNDER_REVIEW';

  return (
    <div className="space-y-4">
      <Link to="/admin/disputes" className="text-sm text-brand">
        ← Disputes
      </Link>
      <Card>
        <DisputeThread
          dispute={data}
          currentUserId={user?.id ?? ''}
          sending={send.isPending}
          error={send.isError ? errorMessage(send.error) : null}
          onSend={(text) => {
            send.mutate(text);
          }}
        />
      </Card>

      {data.status === 'OPEN' ? (
        <Button
          variant="secondary"
          loading={review.isPending}
          onClick={() => {
            review.mutate();
          }}
        >
          Take into review
        </Button>
      ) : null}

      {open ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">Resolve</h2>
          {order.isPending ? <Skeleton className="h-32" /> : null}
          {order.isError ? (
            <ErrorState
              message="Could not load the shipment."
              onRetry={() => void order.refetch()}
            />
          ) : null}
          {sellerOrder !== undefined ? (
            <DisputeResolutionForm
              sellerOrder={sellerOrder}
              pending={resolve.isPending}
              error={resolve.isError ? errorMessage(resolve.error) : null}
              onSubmit={(body) => {
                resolve.mutate(body);
              }}
            />
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
