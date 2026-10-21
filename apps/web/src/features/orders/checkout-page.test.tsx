import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderRoutes } from '../../test/render';
import { server } from '../../test/server';

import { CheckoutPage } from './checkout-page';

const cart = {
  groups: [
    {
      seller: { id: 's1', name: 'KeyShop' },
      subtotalCents: 2000,
      items: [
        {
          productId: 'p1',
          title: 'Keyboard',
          unitPriceCents: 1000,
          quantity: 1,
          stock: 5,
          availability: 'AVAILABLE',
          lineTotalCents: 1000,
        },
        {
          productId: 'p2',
          title: 'Mouse',
          unitPriceCents: 1000,
          quantity: 1,
          stock: 5,
          availability: 'AVAILABLE',
          lineTotalCents: 1000,
        },
      ],
    },
    {
      seller: { id: 's2', name: 'AudioHub' },
      subtotalCents: 500,
      items: [
        {
          productId: 'p3',
          title: 'Cable',
          unitPriceCents: 500,
          quantity: 1,
          stock: 5,
          availability: 'AVAILABLE',
          lineTotalCents: 500,
        },
      ],
    },
  ],
  totalCents: 2500,
  itemsCount: 3,
  sellerCount: 2,
};

function renderCheckout() {
  return renderRoutes(
    [
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/checkout/success/:orderId', element: <p>order placed</p> },
    ],
    '/checkout',
  );
}

describe('CheckoutPage', () => {
  it('announces the split into shipments', async () => {
    server.use(http.get('/api/cart', () => HttpResponse.json(cart)));
    renderCheckout();

    expect(
      await screen.findByText('Your order will be split into 2 shipments from 2 sellers.'),
    ).toBeInTheDocument();
  });

  it('highlights the items a 409 refuses and blocks another attempt', async () => {
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cart)),
      http.post('/api/orders/checkout', () =>
        HttpResponse.json(
          {
            error: {
              code: 'CART_ITEMS_UNAVAILABLE',
              message: 'Some items in the cart cannot be bought',
              details: { items: [{ productId: 'p2', reason: 'INSUFFICIENT_STOCK' }] },
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderCheckout();
    await screen.findByText('Mouse');

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText('Only 5 in stock')).toBeInTheDocument();
    expect(screen.getByText('Mouse').closest('li')).toHaveAttribute(
      'data-problem',
      'INSUFFICIENT_STOCK',
    );
    expect(screen.getByText('Keyboard').closest('li')).not.toHaveAttribute('data-problem');
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove unavailable items' })).toBeInTheDocument();
  });

  it('reuses the idempotency key when the same attempt is retried after a 5xx', async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cart)),
      http.post('/api/orders/checkout', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return keys.length === 1
          ? HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 })
          : HttpResponse.json({ id: 'o1' }, { status: 201 });
      }),
    );
    renderCheckout();
    await screen.findByText('Mouse');

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText('order placed')).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('sends the total it shows and asks again when the prices changed', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cart)),
      http.post('/api/orders/checkout', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          {
            error: {
              code: 'CHECKOUT_TOTAL_CHANGED',
              message: 'The cart total changed; review the cart and try again',
              details: { expectedTotalCents: cart.totalCents, totalCents: cart.totalCents + 100 },
            },
          },
          { status: 409 },
        );
      }),
    );
    renderCheckout();
    await screen.findByText('Mouse');

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText(/Prices changed since you opened the cart/)).toBeInTheDocument();
    expect(bodies).toEqual([{ expectedTotalCents: cart.totalCents }]);
    expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled();
  });
});
