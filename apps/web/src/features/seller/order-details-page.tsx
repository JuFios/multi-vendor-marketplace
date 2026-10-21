import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { ErrorState } from '../../components/error-state';
import { Modal } from '../../components/modal';
import { Money } from '../../components/money';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import { RefundDialog } from './components/refund-dialog';
import { refundableStatus } from './refund';
import { cancelOwnSellerOrder, changeSellerOrderStatus, fetchSellerOrder } from './seller-api';

export function SellerOrderDetailsPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const order = useQuery({
    queryKey: queryKeys.sellerOrder(id),
    queryFn: () => fetchSellerOrder(id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['seller'] });

  const advance = useMutation({
    mutationFn: (status: 'PROCESSING' | 'SHIPPED') => changeSellerOrderStatus({ id, status }),
    onSuccess: () => {
      toast.push('Status updated', 'ok');
      return refresh();
    },
    onError: (error) => {
      toast.push(errorMessage(error), 'error');
      void refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelOwnSellerOrder({ id, reason: reason.trim() }),
    onSuccess: () => {
      toast.push('Shipment cancelled', 'ok');
      setCancelling(false);
      setReason('');
      return refresh();
    },
  });

  if (order.isPending) {
    return <Skeleton className="h-64" />;
  }
  if (order.isError) {
    return <ErrorState message="Could not load this order." onRetry={() => void order.refetch()} />;
  }
  const data = order.data;
  const reasonValid = reason.trim().length > 0 && reason.trim().length <= 500;

  return (
    <div className="space-y-4">
      <Link to="/seller/orders" className="text-sm text-brand">
        ← Orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Order</h1>
          <p className="text-sm text-muted">Placed {formatDateTime(data.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={data.status} />
          <span className="text-sm text-muted">payment: {data.paymentStatus.toLowerCase()}</span>
        </div>
      </div>

      <Card className="space-y-3">
        <ul className="divide-y divide-line text-sm">
          {data.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2 py-2">
              <span>
                {item.title} × {item.quantity}
                {item.refundedQuantity > 0 ? (
                  <span className="ml-2 text-xs text-warn">{item.refundedQuantity} refunded</span>
                ) : null}
              </span>
              <Money cents={item.lineTotalCents} />
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt>Subtotal</dt>
          <dd className="text-right">
            <Money cents={data.subtotalCents} />
          </dd>
          <dt>Refunded</dt>
          <dd className="text-right">
            <Money cents={data.refundedCents} />
          </dd>
          <dt>Platform commission ({data.commissionRateBps / 100}%)</dt>
          <dd className="text-right">
            <Money cents={data.commissionCents} />
          </dd>
          <dt className="font-medium">Your payout</dt>
          <dd className="text-right font-medium">
            <Money cents={data.payoutCents} />
          </dd>
        </dl>
      </Card>

      <div className="flex flex-wrap gap-2">
        {data.status === 'NEW' ? (
          <Button
            loading={advance.isPending}
            disabled={data.paymentStatus !== 'CAPTURED'}
            onClick={() => {
              advance.mutate('PROCESSING');
            }}
          >
            Start processing
          </Button>
        ) : null}
        {data.status === 'NEW' && data.paymentStatus !== 'CAPTURED' ? (
          <p className="self-center text-sm text-muted">Waiting for the payment to be captured.</p>
        ) : null}
        {data.status === 'PROCESSING' ? (
          <Button
            loading={advance.isPending}
            onClick={() => {
              advance.mutate('SHIPPED');
            }}
          >
            Mark as shipped
          </Button>
        ) : null}
        {refundableStatus(data) ? (
          <Button
            variant="secondary"
            onClick={() => {
              setRefunding(true);
            }}
          >
            Refund items
          </Button>
        ) : null}
        {data.status === 'NEW' || data.status === 'PROCESSING' ? (
          <Button
            variant="danger"
            onClick={() => {
              setCancelling(true);
            }}
          >
            Cancel shipment
          </Button>
        ) : null}
      </div>

      <ol
        className="space-y-0.5 border-l-2 border-line pl-3 text-xs text-muted"
        aria-label="Status history"
      >
        {data.statusHistory.map((entry) => (
          <li key={`${entry.at}-${entry.to}`}>
            {entry.from !== null && entry.from !== undefined ? `${entry.from} → ` : ''}
            <strong>{entry.to}</strong> · {entry.actor.toLowerCase()} · {formatDateTime(entry.at)}
            {entry.reason ? ` — ${entry.reason}` : ''}
          </li>
        ))}
      </ol>

      <Modal
        open={cancelling}
        title="Cancel this shipment?"
        onClose={() => {
          setCancelling(false);
        }}
      >
        <div className="space-y-3">
          <p className="text-sm">The buyer is refunded and the items return to stock.</p>
          <label className="flex flex-col gap-1 text-sm" htmlFor="cancel-reason">
            <span className="font-medium">Reason (shown to the buyer)</span>
            <textarea
              id="cancel-reason"
              rows={3}
              maxLength={500}
              className="rounded-md border border-line px-3 py-2 outline-none ring-brand focus:ring-2"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </label>
          {cancel.isError ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(cancel.error)}
            </p>
          ) : null}
          <Button
            variant="danger"
            disabled={!reasonValid}
            loading={cancel.isPending}
            onClick={() => {
              cancel.mutate();
            }}
          >
            Cancel shipment
          </Button>
        </div>
      </Modal>

      <RefundDialog
        order={refunding ? data : null}
        onClose={() => {
          setRefunding(false);
        }}
        onRefunded={() => {
          toast.push('Refund issued', 'ok');
          setRefunding(false);
          void refresh();
        }}
      />
    </div>
  );
}
