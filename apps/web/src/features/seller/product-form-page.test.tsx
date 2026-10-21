import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderRoutes } from '../../test/render';
import { server } from '../../test/server';

import { EditProductPage, NewProductPage } from './product-form-page';

const CATEGORY = '0b6f6a1e-0000-4000-8000-000000000001';

function renderForm() {
  server.use(
    http.get('/api/categories', () =>
      HttpResponse.json([{ id: CATEGORY, name: 'Home', slug: 'home', parentId: null }]),
    ),
  );
  return renderRoutes(
    [
      { path: '/seller/products/new', element: <NewProductPage /> },
      { path: '/seller/products', element: <p>products list</p> },
    ],
    '/seller/products/new',
  );
}

async function fillCommon() {
  await screen.findByRole('option', { name: 'Home' });
  await userEvent.selectOptions(screen.getByLabelText('Category'), CATEGORY);
  await userEvent.type(screen.getByLabelText('Title'), 'Desk lamp');
  await userEvent.type(screen.getByLabelText('Description'), 'Warm light');
}

describe('product form', () => {
  it('creates a fixed-price product', async () => {
    let body: unknown;
    server.use(
      http.post('/api/seller/products', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'p1' }, { status: 201 });
      }),
    );
    renderForm();
    await fillCommon();

    await userEvent.type(screen.getByLabelText('Price'), '19.99');
    await userEvent.type(screen.getByLabelText('Initial stock'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('products list')).toBeInTheDocument();
    expect(body).toEqual({
      type: 'FIXED_PRICE',
      categoryId: CATEGORY,
      title: 'Desk lamp',
      description: 'Warm light',
      priceCents: 1999,
      stock: 5,
    });
  });

  it('creates an auction with its terms', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/seller/products', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'p2' }, { status: 201 });
      }),
    );
    renderForm();
    await fillCommon();

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'AUCTION');
    await userEvent.type(screen.getByLabelText('Starting price'), '10');
    await userEvent.type(screen.getByLabelText('Bid step'), '1.50');
    const ends = new Date(Date.now() + 3 * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    fireEvent.change(screen.getByLabelText('Ends at'), {
      target: {
        value: `${ends.getFullYear()}-${pad(ends.getMonth() + 1)}-${pad(ends.getDate())}T${pad(ends.getHours())}:${pad(ends.getMinutes())}`,
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('products list')).toBeInTheDocument();
    expect(body).toMatchObject({ type: 'AUCTION', startPriceCents: 1000, bidStepCents: 150 });
    expect(typeof body.endsAt).toBe('string');
  });

  it('shows validation errors and sends nothing for an empty form', async () => {
    let posted = false;
    server.use(
      http.post('/api/seller/products', () => {
        posted = true;
        return HttpResponse.json({});
      }),
    );
    renderForm();
    await screen.findByRole('option', { name: 'Home' });

    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    expect(screen.getByText('Choose a category')).toBeInTheDocument();
    expect(screen.getByText('Enter a price like 19.99')).toBeInTheDocument();
    expect(posted).toBe(false);
  });
});

describe('stock control', () => {
  const lamp = {
    id: 'p1',
    sellerId: 's1',
    categoryId: CATEGORY,
    type: 'FIXED_PRICE',
    title: 'Desk lamp',
    description: 'Warm light',
    images: [],
    priceCents: 1999,
    stock: 10,
    version: 4,
    moderationStatus: 'APPROVED',
    moderationReason: null,
    isPublished: true,
    archivedAt: null,
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('sends the version it was decided on and reloads the product on a conflict', async () => {
    const bodies: unknown[] = [];
    let current = lamp;
    server.use(
      http.get('/api/categories', () =>
        HttpResponse.json([{ id: CATEGORY, name: 'Home', slug: 'home', parentId: null }]),
      ),
      http.get('/api/seller/products/p1', () => HttpResponse.json(current)),
      http.patch('/api/seller/products/p1/stock', async ({ request }) => {
        bodies.push(await request.json());
        // Three units sold since the page was loaded.
        current = { ...lamp, stock: 7, version: 5, updatedAt: '2026-01-02T00:00:00Z' };
        return HttpResponse.json(
          {
            error: {
              code: 'PRODUCT_VERSION_CONFLICT',
              message: 'The product changed since you loaded it',
              details: { stock: 7, version: 5 },
            },
          },
          { status: 409 },
        );
      }),
    );
    renderRoutes(
      [{ path: '/seller/products/:id', element: <EditProductPage /> }],
      '/seller/products/p1',
    );

    const input = await screen.findByLabelText('Units in stock');
    await userEvent.clear(input);
    await userEvent.type(input, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Update stock' }));

    expect(await screen.findByText(/Now in stock: 7\./)).toBeInTheDocument();
    expect(bodies).toEqual([{ stock: 15, expectedVersion: 4 }]);
    expect(screen.getByLabelText('Units in stock')).toHaveValue(15);
  });
});
