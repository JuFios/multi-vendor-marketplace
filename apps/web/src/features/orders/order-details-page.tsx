import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Button } from '../../components/button';
import { ErrorState } from '../../components/error-state';
import { Modal } from '../../components/modal';
import { Money } from '../../components/money';
import { Skeleton } from '../../components/skeleton';
import { OrderStatusBadge } from '../../components/status-badge';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import { fetchDisputes } from '../disputes/disputes-api';

import { DisputeDialog } from './components/dispute-dialog';
import { ReviewDialog } from './components/review-dialog';
import { SellerOrderCard } from './components/seller-order-card';
import { cancelSellerOrder, confirmReceipt, fetchOrder } from './orders-api';

export function OrderDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ id: string; title: string } | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);

  // The realtime layer invalidates ['order', id] when a shipment changes status.
  const order = useQuery({ queryKey: queryKeys.order(id), queryFn: () => fetchOrder(id) });
  const disputes = useQuery({
    queryKey: queryKeys.disputes({ page: 1 }),
    queryFn: () => fetchDisputes(1),
  });

  const refreshOrder = () => queryClient.invalidateQueries({ queryKey: queryKeys.order(id) });
  const cancel = useMutation({
    mutationFn: (sellerOrderId: string) => cancelSellerOrder({ orderId: id, sellerOrderId }),
    onSuccess: () => {
      toast.push('Shipment cancelled', 'ok');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      return refreshOrder();
    },
    onError: (error) => {
      toast.push(errorMessage(error), 'error');
      void refreshOrder();
    },
    onSettled: () => {
      setCancelling(null);
    },
  });
  const receive = useMutation({
    mutationFn: (sellerOrderId: string) => confirmReceipt({ orderId: id, sellerOrderId }),
    onSuccess: () => {
      toast.push('Receipt confirmed', 'ok');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      return refreshOrder();
    },
    onError: (error) => {
      toast.push(errorMessage(error), 'error');
      void refreshOrder();
    },
  });

  if (order.isPending) {
    return <Skeleton className="h-64" />;
  }
  if (order.isError) {
    return <ErrorState message="Could not load this order." onRetry={() => void order.refetch()} />;
  }

  const data = order.data;
  const disputeOf = (sellerOrderId: string) => {
    const found = disputes.data?.items.find((dispute) => dispute.sellerOrderId === sellerOrderId);
    return found === undefined ? undefined : { id: found.id, status: found.status };
  };

  return (
    <div className="space-y-4">
      <Link to="/account/orders" className="text-sm text-brand">
        ← My orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Order details</h1>
          <p className="text-sm text-muted">Placed {formatDateTime(data.createdAt)}</p>
        </div>
        <div className="text-right">
          <OrderStatusBadge status={data.status} hasCancelledParts={data.hasCancelledParts} />
          <p className="mt-1 font-semibold">
            <Money cents={data.totalCents} />
          </p>
          {data.refundedCents > 0 ? (
            <p className="text-sm text-warn">
              Refunded: <Money cents={data.refundedCents} />
            </p>
          ) : null}
        </div>
      </div>

      {data.sellerOrders.map((sellerOrder) => (
        <SellerOrderCard
          key={sellerOrder.id}
          sellerOrder={sellerOrder}
          dispute={disputeOf(sellerOrder.id)}
          busy={receive.isPending || cancel.isPending}
          onCancel={() => {
            setCancelling(sellerOrder.id);
          }}
          onConfirmReceipt={() => {
            receive.mutate(sellerOrder.id);
          }}
          onReview={(item) => {
            setReviewing({ id: item.productId, title: item.title });
          }}
          onOpenDispute={() => {
            setDisputing(sellerOrder.id);
          }}
        />
      ))}

      <Modal
        open={cancelling !== null}
        title="Cancel this shipment?"
        onClose={() => {
          setCancelling(null);
        }}
      >
        <p className="mb-4 text-sm">
          Only this seller&apos;s part of the order is cancelled. Other shipments are not affected.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setCancelling(null);
            }}
          >
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() => {
              if (cancelling !== null) {
                cancel.mutate(cancelling);
              }
            }}
          >
            Cancel shipment
          </Button>
        </div>
      </Modal>

      <ReviewDialog
        product={reviewing}
        onClose={() => {
          setReviewing(null);
        }}
      />
      <DisputeDialog
        sellerOrderId={disputing}
        onClose={() => {
          setDisputing(null);
        }}
        onOpened={(dispute) => {
          setDisputing(null);
          void queryClient.invalidateQueries({ queryKey: ['disputes'] });
          void navigate(`/account/disputes/${dispute.id}`);
        }}
      />
    </div>
  );
}
