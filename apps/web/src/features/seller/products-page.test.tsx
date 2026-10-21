import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { SellerProductsPage } from './products-page';

const product = {
  id: 'p1',
  sellerId: 's1',
  categoryId: 'c1',
  type: 'AUCTION',
  title: 'Old vase',
  description: 'x',
  images: [],
  priceCents: null,
  stock: 1,
  version: 1,
  moderationStatus: 'APPROVED',
  moderationReason: null,
  isPublished: true,
  archivedAt: null,
  ratingAvg: 0,
  ratingCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('SellerProductsPage', () => {
  it('explains why a lot with bids cannot be archived', async () => {
    server.use(
      http.get('/api/seller/products', () =>
        HttpResponse.json({ items: [product], total: 1, page: 1, limit: 10 }),
      ),
      http.delete('/api/seller/products/p1', () =>
        HttpResponse.json(
          { error: { code: 'PRODUCT_HAS_ACTIVE_AUCTION', message: 'active' } },
          { status: 409 },
        ),
      ),
    );
    renderAt(<SellerProductsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Archive Old vase' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'has bids or a winner who has not checked out yet',
    );
  });

  it('archives a product after confirmation', async () => {
    let archived = false;
    server.use(
      http.get('/api/seller/products', () =>
        HttpResponse.json({ items: [product], total: 1, page: 1, limit: 10 }),
      ),
      http.delete('/api/seller/products/p1', () => {
        archived = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAt(<SellerProductsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Archive Old vase' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Product archived')).toBeInTheDocument();
    expect(archived).toBe(true);
  });

  it('shows an empty state without products', async () => {
    server.use(
      http.get('/api/seller/products', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 10 }),
      ),
    );
    renderAt(<SellerProductsPage />);

    expect(await screen.findByText('No products found')).toBeInTheDocument();
  });
});
