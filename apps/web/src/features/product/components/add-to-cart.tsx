import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import { Button } from '../../../components/button';
import { Input } from '../../../components/input';
import { useToast } from '../../../components/toast-context';
import { errorMessage } from '../../../lib/api/error-message';
import { queryKeys } from '../../../lib/query-keys';
import { useSessionUser } from '../../auth/use-session';
import { addToCart } from '../product-api';

export function AddToCart({ productId, stock }: { productId: string; stock: number }) {
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [quantity, setQuantity] = useState('1');
  const parsed = Number(quantity);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= stock;

  const add = useMutation({
    mutationFn: () => addToCart({ productId, quantity: parsed }),
    onSuccess: (cart) => {
      queryClient.setQueryData(queryKeys.cart, cart);
      toast.push('Added to cart', 'ok');
    },
  });

  if (user === null) {
    return (
      <p className="text-sm">
        <Link to="/login" className="font-medium text-brand">
          Log in
        </Link>{' '}
        to add this product to your cart.
      </p>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          add.mutate();
        }
      }}
    >
      <div className="w-24">
        <Input
          label="Quantity"
          type="number"
          min={1}
          max={Math.max(stock, 1)}
          value={quantity}
          error={!valid && stock > 0 ? `1–${stock}` : undefined}
          onChange={(event) => {
            setQuantity(event.target.value);
          }}
        />
      </div>
      <Button type="submit" disabled={!valid || stock <= 0} loading={add.isPending}>
        Add to cart
      </Button>
      {add.isError ? (
        <p role="alert" className="w-full text-sm text-danger">
          {errorMessage(add.error)}
        </p>
      ) : null}
    </form>
  );
}
