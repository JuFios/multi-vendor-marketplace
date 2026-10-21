import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';

import { CatalogPage } from './catalog-page';

const item = {
  id: 'p1',
  type: 'FIXED_PRICE',
  title: 'Mechanical keyboard',
  imageUrl: null,
  priceCents: 12000,
  inStock: true,
  stock: 4,
  rating: { average: 4.5, count: 2 },
  seller: { id: 's1', name: 'KeyShop' },
  category: { id: 'c1', name: 'Peripherals' },
};

function page(overrides: object = {}) {
  return {
    items: [item],
    total: 1,
    page: 1,
    limit: 12,
    facets: {
      categories: [{ id: 'c1', name: 'Peripherals', count: 1 }],
      sellers: [{ id: 's1', name: 'KeyShop', count: 1 }],
      types: [{ value: 'FIXED_PRICE', count: 1 }],
      inStock: [{ value: true, count: 1 }],
    },
    priceRange: { min: 12000, max: 12000 },
    degraded: false,
    ...overrides,
  };
}

function renderCatalog(initial = '/') {
  const router = createMemoryRouter([{ path: '/', element: <CatalogPage /> }], {
    initialEntries: [initial],
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('CatalogPage', () => {
  it('renders products with facet counts', async () => {
    server.use(http.get('/api/catalog', () => HttpResponse.json(page())));
    renderCatalog();

    expect(await screen.findByText('Mechanical keyboard')).toBeInTheDocument();
    expect(screen.getByLabelText(/Peripherals/)).toBeInTheDocument();
  });

  it('writes a selected facet into the URL and sends it to the api', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/catalog', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(page());
      }),
    );
    const router = renderCatalog();
    await screen.findByText('Mechanical keyboard');

    await userEvent.click(screen.getByLabelText(/Peripherals/));

    expect(router.state.location.search).toBe('?categoryId=c1');
    await screen.findByText('Mechanical keyboard');
    expect(seen.at(-1)).toContain('categoryId=c1');
  });

  it('shows the limited-mode banner when search is degraded', async () => {
    server.use(http.get('/api/catalog', () => HttpResponse.json(page({ degraded: true }))));
    renderCatalog();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Search is running in limited mode',
    );
  });

  it('shows an empty state when nothing matches', async () => {
    server.use(http.get('/api/catalog', () => HttpResponse.json(page({ items: [], total: 0 }))));
    renderCatalog('/?q=zzz');

    expect(await screen.findByText('No products found')).toBeInTheDocument();
  });

  it('offers a retry when the catalog fails to load', async () => {
    server.use(
      http.get('/api/catalog', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
      ),
    );
    renderCatalog();

    expect(await screen.findByText('Could not load the catalog.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
