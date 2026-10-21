import { useQuery } from '@tanstack/react-query';

import { Button, ButtonLink } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Skeleton } from '../../components/skeleton';
import { queryKeys } from '../../lib/query-keys';

import { fetchCart } from './cart-api';
import { CartSellerGroup } from './components/cart-seller-group';
import { useCartMutations } from './use-cart-mutations';

export function CartPage() {
  const cart = useQuery({ queryKey: queryKeys.cart, queryFn: fetchCart });
  const { setQuantity, remove } = useCartMutations();

  if (cart.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (cart.isError) {
    return <ErrorState message="Could not load your cart." onRetry={() => void cart.refetch()} />;
  }
  if (cart.data.groups.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Your cart</h1>
        <EmptyState
          title="Your cart is empty"
          detail="Add something from the catalog."
          action={<ButtonLink to="/">Browse the catalog</ButtonLink>}
        />
      </div>
    );
  }

  const blocked = cart.data.groups.some((group) =>
    group.items.some((item) => item.availability !== 'AVAILABLE'),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your cart</h1>
      {blocked ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-warn">
          Some items are no longer available in the requested quantity. Update or remove them before
          checking out.
        </p>
      ) : null}
      {cart.data.groups.map((group) => (
        <CartSellerGroup
          key={group.seller.id}
          group={group}
          onQuantityChange={(productId, quantity) => {
            setQuantity.mutate({ productId, quantity });
          }}
          onRemove={(productId) => {
            remove.mutate(productId);
          }}
        />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
        <p>
          {cart.data.itemsCount} items from {cart.data.sellerCount}{' '}
          {cart.data.sellerCount === 1 ? 'seller' : 'sellers'}
        </p>
        <p className="text-lg font-semibold">
          Total: <Money cents={cart.data.totalCents} />
        </p>
        {blocked ? (
          <Button disabled>Proceed to checkout</Button>
        ) : (
          <ButtonLink to="/checkout">Proceed to checkout</ButtonLink>
        )}
      </div>
    </div>
  );
}
