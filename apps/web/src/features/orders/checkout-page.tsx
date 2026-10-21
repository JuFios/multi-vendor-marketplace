import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Skeleton } from '../../components/skeleton';
import { errorMessage } from '../../lib/api/error-message';
import { checkoutUnavailableItems, isApiError } from '../../lib/api/errors';
import { IdempotencySession } from '../../lib/api/idempotency';
import { queryKeys } from '../../lib/query-keys';
import { fetchCart } from '../cart/cart-api';
import { CartSellerGroup, type ItemProblem } from '../cart/components/cart-seller-group';
import { useCartMutations } from '../cart/use-cart-mutations';

import { checkout } from './orders-api';

export function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cart = useQuery({ queryKey: queryKeys.cart, queryFn: fetchCart });
  const { remove } = useCartMutations();
  const attempt = useRef(new IdempotencySession());
  const [problems, setProblems] = useState<ReadonlyMap<string, ItemProblem>>(new Map());
  const [failure, setFailure] = useState<string | null>(null);

  const place = useMutation({
    // A retry of the same attempt (network error, 5xx) reuses the key; any final answer ends it.
    mutationFn: () => checkout(attempt.current.current()),
    onSuccess: (order) => {
      attempt.current.reset();
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void navigate(`/checkout/success/${order.id}`, { replace: true });
    },
    onError: (error) => {
      if (!isApiError(error) || error.status < 500) {
        attempt.current.reset();
      }
      if (isApiError(error) && error.status === 409) {
        const unavailable = checkoutUnavailableItems(error);
        setProblems(new Map(unavailable.map((item) => [item.productId, item.reason])));
        setFailure(
          unavailable.length > 0
            ? 'Some items can no longer be bought. Remove them or adjust your cart to continue.'
            : errorMessage(error),
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
        return;
      }
      setFailure(errorMessage(error));
    },
  });

  if (cart.isPending) {
    return <Skeleton className="h-64" />;
  }
  if (cart.isError) {
    return <ErrorState message="Could not load your cart." onRetry={() => void cart.refetch()} />;
  }
  if (cart.data.groups.length === 0) {
    return (
      <div className="space-y-3 text-center">
        <EmptyState title="Nothing to check out" detail="Your cart is empty." />
        <Link to="/" className="text-sm font-medium text-brand">
          Browse the catalog
        </Link>
      </div>
    );
  }

  const { sellerCount, totalCents } = cart.data;
  const hasProblems = problems.size > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Checkout</h1>
      <p className="text-sm">
        Your order will be split into {sellerCount} {sellerCount === 1 ? 'shipment' : 'shipments'}{' '}
        from {sellerCount} {sellerCount === 1 ? 'seller' : 'sellers'}.
      </p>
      {failure !== null ? (
        <div role="alert" className="space-y-2 rounded-md bg-red-50 p-3 text-sm text-danger">
          <p>{failure}</p>
          {hasProblems ? (
            <Button
              variant="danger"
              onClick={() => {
                for (const productId of problems.keys()) {
                  remove.mutate(productId);
                }
                setProblems(new Map());
                setFailure(null);
              }}
            >
              Remove unavailable items
            </Button>
          ) : null}
        </div>
      ) : null}
      {cart.data.groups.map((group) => (
        <CartSellerGroup key={group.seller.id} group={group} problems={problems} readOnly />
      ))}
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
        <Link to="/cart" className="text-sm text-brand">
          Edit cart
        </Link>
        <p className="text-lg font-semibold">
          Total: <Money cents={totalCents} />
        </p>
        <Button
          loading={place.isPending}
          disabled={hasProblems}
          onClick={() => {
            setFailure(null);
            place.mutate();
          }}
        >
          Place order
        </Button>
      </div>
    </div>
  );
}
