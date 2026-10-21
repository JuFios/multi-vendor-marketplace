import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { sellerOrder } from '../../test/fixtures';
import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { SellerOrdersPage } from './orders-page';

describe('SellerOrdersPage', () => {
  it('filters the list by status through the URL', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('/api/seller/orders', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('status'));
        return HttpResponse.json({ items: [sellerOrder()], total: 1, page: 1, limit: 10 });
      }),
    );
    renderAt(<SellerOrdersPage />);
    await screen.findByRole('link', { name: 'Open' });

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'SHIPPED');

    await screen.findByRole('link', { name: 'Open' });
    expect(seen).toContain('SHIPPED');
  });

  it('shows an empty state', async () => {
    server.use(
      http.get('/api/seller/orders', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 10 }),
      ),
    );
    renderAt(<SellerOrdersPage />);

    expect(await screen.findByText('No orders found')).toBeInTheDocument();
  });
});
