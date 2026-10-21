import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderRoutes } from '../../test/render';
import { server } from '../../test/server';

import { NewProductPage } from './product-form-page';

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
