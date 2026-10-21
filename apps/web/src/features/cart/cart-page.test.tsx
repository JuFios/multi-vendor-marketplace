import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { CartPage } from './cart-page';

function cartBody(quantity: number) {
  return {
    groups: [
      {
        seller: { id: 's1', name: 'KeyShop' },
        subtotalCents: 1000 * quantity,
        items: [
          {
            productId: 'p1',
            title: 'Keyboard',
            unitPriceCents: 1000,
            quantity,
            stock: 5,
            availability: 'AVAILABLE',
            lineTotalCents: 1000 * quantity,
          },
        ],
      },
    ],
    totalCents: 1000 * quantity,
    itemsCount: quantity,
    sellerCount: 1,
  };
}

describe('CartPage', () => {
  it('shows the new quantity at once and keeps the server answer', async () => {
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cartBody(1))),
      http.patch('/api/cart/items/p1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(cartBody(2));
      }),
    );
    renderAt(<CartPage />);
    const group = await screen.findByLabelText('Items from KeyShop');

    await userEvent.click(
      within(group).getByRole('button', { name: 'Increase quantity of Keyboard' }),
    );

    expect(within(group).getByText('2')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Total:')).toHaveTextContent('$20.00');
    });
  });

  it('rolls the quantity back when the server answers 409', async () => {
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cartBody(1))),
      http.patch('/api/cart/items/p1', () =>
        HttpResponse.json(
          { error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock' } },
          { status: 409 },
        ),
      ),
    );
    renderAt(<CartPage />);
    const group = await screen.findByLabelText('Items from KeyShop');

    await userEvent.click(
      within(group).getByRole('button', { name: 'Increase quantity of Keyboard' }),
    );

    expect(await screen.findByText('Not enough stock')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(group).getByText('1')).toBeInTheDocument();
    });
    expect(screen.getByText('Total:')).toHaveTextContent('$10.00');
  });

  it('shows an empty state for an empty cart', async () => {
    server.use(
      http.get('/api/cart', () =>
        HttpResponse.json({ groups: [], totalCents: 0, itemsCount: 0, sellerCount: 0 }),
      ),
    );
    renderAt(<CartPage />);

    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
  });
});
