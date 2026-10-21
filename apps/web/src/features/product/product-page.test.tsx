import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../components/toast';
import { sessionStore } from '../../lib/session';
import { realtimeClient, type ChannelHandlers } from '../../lib/ws/realtime';
import { server } from '../../test/server';

import { ProductPage } from './product-page';

const product = {
  id: 'p1',
  type: 'FIXED_PRICE',
  title: 'Desk lamp',
  description: 'Warm light.',
  images: [],
  priceCents: 3500,
  stock: 9,
  inStock: true,
  version: 1,
  rating: { average: 4, count: 1 },
  seller: { id: 's1', storeName: 'LampCo' },
  category: { id: 'c1', name: 'Home', slug: 'home' },
  createdAt: '2026-01-01T00:00:00Z',
  auction: null,
};

let handlers: ChannelHandlers;

function renderPage() {
  const router = createMemoryRouter([{ path: '/products/:id', element: <ProductPage /> }], {
    initialEntries: ['/products/p1'],
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ProductPage', () => {
  beforeEach(() => {
    vi.spyOn(realtimeClient, 'follow').mockImplementation((_request, next) => {
      handlers = next;
      return () => undefined;
    });
    sessionStore.setSession({
      accessToken: 'jwt',
      user: { id: 'u1', email: 'a@b.co', name: 'A', roles: ['CUSTOMER'], emailVerified: true },
    });
    server.use(
      http.get('/api/products/p1', () => HttpResponse.json(product)),
      http.get('/api/products/p1/reviews', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 5 }),
      ),
      http.get('/api/products/p1/similar', () => HttpResponse.json([])),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStore.setSession(null);
  });

  it('follows the live stock of a fixed-price product', async () => {
    renderPage();
    expect(await screen.findByText('In stock')).toBeInTheDocument();

    act(() => {
      handlers.onEvent({ productId: 'p1', stock: 3, inStock: true, version: 2 });
    });
    expect(await screen.findByText('Only 3 left')).toBeInTheDocument();

    act(() => {
      handlers.onEvent({ productId: 'p1', stock: 0, inStock: false, version: 3 });
    });
    expect(await screen.findByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
  });

  it('adds the chosen quantity to the cart', async () => {
    let body: unknown;
    server.use(
      http.post('/api/cart/items', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { groups: [], totalCents: 0, itemsCount: 2, sellerCount: 1 },
          { status: 201 },
        );
      }),
    );
    renderPage();
    await screen.findByText('In stock');

    const { default: userEvent } = await import('@testing-library/user-event');
    const quantity = screen.getByLabelText('Quantity');
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(await screen.findByText('Added to cart')).toBeInTheDocument();
    expect(body).toEqual({ productId: 'p1', quantity: 2 });
  });

  it('shows a not-found message for an unknown product', async () => {
    server.use(
      http.get('/api/products/p1', () =>
        HttpResponse.json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'no' } }, { status: 404 }),
      ),
    );
    renderPage();

    expect(await screen.findByText(/does not exist/)).toBeInTheDocument();
  });
});
