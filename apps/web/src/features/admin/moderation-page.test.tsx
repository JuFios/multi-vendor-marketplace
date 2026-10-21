import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { ProductModerationPage } from './moderation-page';

const product = {
  id: 'p1',
  sellerId: 's1',
  categoryId: 'c1',
  type: 'FIXED_PRICE',
  title: 'Desk lamp',
  description: 'x',
  images: [],
  priceCents: 3500,
  stock: 3,
  version: 1,
  moderationStatus: 'PENDING',
  moderationReason: null,
  isPublished: true,
  archivedAt: null,
  ratingAvg: 0,
  ratingCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ProductModerationPage', () => {
  it('approves a pending product', async () => {
    let approved = false;
    server.use(
      http.get('/api/admin/products', () =>
        HttpResponse.json({ items: [product], total: 1, page: 1, limit: 10 }),
      ),
      http.post('/api/admin/products/p1/approve', () => {
        approved = true;
        return HttpResponse.json({ ...product, moderationStatus: 'APPROVED' });
      }),
    );
    renderAt(<ProductModerationPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve Desk lamp' }));

    expect(await screen.findByText('Product approved')).toBeInTheDocument();
    expect(approved).toBe(true);
  });

  it('rejects a product with a reason', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/products', () =>
        HttpResponse.json({ items: [product], total: 1, page: 1, limit: 10 }),
      ),
      http.post('/api/admin/products/p1/reject', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...product, moderationStatus: 'REJECTED' });
      }),
    );
    renderAt(<ProductModerationPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reject Desk lamp' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Misleading photos');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject product' }));

    expect(await screen.findByText('Product rejected')).toBeInTheDocument();
    expect(body).toEqual({ reason: 'Misleading photos' });
  });
});
