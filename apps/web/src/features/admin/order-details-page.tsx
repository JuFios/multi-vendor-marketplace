import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { ReasonDialog } from '../../components/reason-dialog';
import { Skeleton } from '../../components/skeleton';
import { OrderStatusBadge } from '../../components/status-badge';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import { SellerOrderCard } from '../orders/components/seller-order-card';

import { adminCancelSellerOrder, adminCompleteSellerOrder, fetchAdminOrder } from './admin-api';

export function AdminOrderDetailsPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cancelling, setCancelling] = useState<string | null>(null);

  const order = useQuery({
    queryKey: queryKeys.adminOrder(id),
    queryFn: () => fetchAdminOrder(id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const cancel = useMutation({
    mutationFn: adminCancelSellerOrder,
    onSuccess: () => {
      toast.push('Shipment cancelled', 'ok');
      setCancelling(null);
      return refresh();
    },
  });
  const complete = useMutation({
    mutationFn: adminCompleteSellerOrder,
    onSuccess: () => {
      toast.push('Shipment marked as completed', 'ok');
      return refresh();
    },
    onError: (error) => {
      toast.push(errorMessage(error), 'error');
    },
  });

  if (order.isPending) {
    return <Skeleton className="h-64" />;
  }
  if (order.isError) {
    return <ErrorState message="Could not load this order." onRetry={() => void order.refetch()} />;
  }
  const data = order.data;

  return (
    <div className="space-y-4">
      <Link to="/admin/orders" className="text-sm text-brand">
        ← Orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Order</h1>
          <p className="text-sm text-muted">Placed {formatDateTime(data.createdAt)}</p>
        </div>
        <div className="text-right">
          <OrderStatusBadge status={data.status} hasCancelledParts={data.hasCancelledParts} />
          <p className="mt-1 font-semibold">
            <Money cents={data.totalCents} />
          </p>
        </div>
      </div>

      {data.sellerOrders.map((sellerOrder) => (
        <div key={sellerOrder.id} className="space-y-2">
          <SellerOrderCard
            sellerOrder={sellerOrder}
            busy={cancel.isPending || complete.isPending}
            cancellableStatuses={['NEW', 'PROCESSING']}
            onCancel={() => {
              setCancelling(sellerOrder.id);
            }}
            {...(sellerOrder.status === 'SHIPPED' && {
              onConfirmReceipt: () => {
                complete.mutate(sellerOrder.id);
              },
            })}
          />
        </div>
      ))}

      <ReasonDialog
        open={cancelling !== null}
        title="Cancel this shipment"
        description="Only this seller's part of the order is cancelled. A shipment that already left is not returned to stock."
        confirmLabel="Cancel shipment"
        pending={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : null}
        onClose={() => {
          setCancelling(null);
        }}
        onConfirm={(reason) => {
          if (cancelling !== null) {
            cancel.mutate({ id: cancelling, reason });
          }
        }}
      />
    </div>
  );
}
