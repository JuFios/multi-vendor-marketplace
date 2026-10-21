import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { queryKeys } from '../../lib/query-keys';

import { removeCartItem, setCartQuantity, type Cart } from './cart-api';
import { withoutItem, withQuantity } from './cart-model';

interface Snapshot {
  previous: Cart | undefined;
}

/** Optimistic cart edits: show the result at once, roll back to the snapshot if the server refuses. */
export function useCartMutations() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const optimistic = <Variables>(apply: (cart: Cart, variables: Variables) => Cart) => ({
    // Edits run one after another so a late response cannot overwrite a newer edit.
    scope: { id: 'cart' },
    onMutate: async (variables: Variables): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey: queryKeys.cart });
      const previous = queryClient.getQueryData<Cart>(queryKeys.cart);
      if (previous !== undefined) {
        queryClient.setQueryData(queryKeys.cart, apply(previous, variables));
      }
      return { previous };
    },
    onError: (error: unknown, _variables: Variables, snapshot: Snapshot | undefined) => {
      if (snapshot?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.cart, snapshot.previous);
      }
      toast.push(errorMessage(error), 'error');
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
    },
    onSuccess: (cart: Cart) => {
      queryClient.setQueryData(queryKeys.cart, cart);
    },
  });

  const setQuantity = useMutation({
    mutationFn: setCartQuantity,
    ...optimistic((cart, variables: { productId: string; quantity: number }) =>
      withQuantity(cart, variables.productId, variables.quantity),
    ),
  });

  const remove = useMutation({
    mutationFn: removeCartItem,
    ...optimistic((cart, productId: string) => withoutItem(cart, productId)),
  });

  return { setQuantity, remove };
}
