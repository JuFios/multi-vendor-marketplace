import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';

import { Card } from '../../components/card';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Skeleton } from '../../components/skeleton';
import { queryKeys } from '../../lib/query-keys';

import { fetchOrder } from './orders-api';

export function CheckoutSuccessPage() {
  const { orderId = '' } = useParams();
  const order = useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: () => fetchOrder(orderId),
  });

  if (order.isPending) {
    return <Skeleton className="h-40" />;
  }
  if (order.isError) {
    return (
      <ErrorState
        message="Your order was placed, but we could not load it."
        onRetry={() => void order.refetch()}
      />
    );
  }
  return (
    <Card className="mx-auto max-w-lg space-y-3">
      <h1 className="text-2xl font-semibold text-ok">Thank you for your order!</h1>
      <p className="text-sm">
        Your order was split into {order.data.sellerOrders.length}{' '}
        {order.data.sellerOrders.length === 1 ? 'shipment' : 'shipments'}. Total:{' '}
        <strong>
          <Money cents={order.data.totalCents} />
        </strong>
      </p>
      <ul className="list-disc pl-5 text-sm">
        {order.data.sellerOrders.map((sellerOrder) => (
          <li key={sellerOrder.id}>
            {sellerOrder.seller.name}: <Money cents={sellerOrder.subtotalCents} />
          </li>
        ))}
      </ul>
      <div className="flex gap-4 text-sm">
        <Link to={`/account/orders/${order.data.id}`} className="font-medium text-brand">
          View order
        </Link>
        <Link to="/" className="text-brand">
          Continue shopping
        </Link>
      </div>
    </Card>
  );
}
