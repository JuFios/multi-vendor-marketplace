import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { order, sellerOrder } from '../../test/fixtures';
import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { AdminOrderDetailsPage } from './order-details-page';

function renderOrder(sellerOrders: unknown[]) {
  server.use(http.get('/api/admin/orders/o1', () => HttpResponse.json(order(sellerOrders))));
  renderAt(<AdminOrderDetailsPage />, '/admin/orders/o1', '/admin/orders/:id');
}

describe('AdminOrderDetailsPage', () => {
  it('cancels one shipment with a reason and leaves the others alone', async () => {
    let body: unknown;
    server.use(
      http.post('/api/admin/seller-orders/so1/cancel', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(sellerOrder({ status: 'CANCELLED' }));
      }),
    );
    renderOrder([
      sellerOrder({ id: 'so1', status: 'PROCESSING' }),
      sellerOrder({ id: 'so2', status: 'COMPLETED', seller: { id: 's2', name: 'AudioHub' } }),
    ]);

    const processing = await screen.findByLabelText('Shipment from KeyShop');
    expect(
      within(screen.getByLabelText('Shipment from AudioHub')).queryByRole('button', {
        name: 'Cancel shipment',
      }),
    ).toBeNull();

    await userEvent.click(within(processing).getByRole('button', { name: 'Cancel shipment' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Fraud suspected');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel shipment' }));

    expect(await screen.findByText('Shipment cancelled')).toBeInTheDocument();
    expect(body).toEqual({ reason: 'Fraud suspected' });
  });

  it('marks a shipped shipment as completed', async () => {
    let completed = false;
    server.use(
      http.post('/api/admin/seller-orders/so1/status', () => {
        completed = true;
        return HttpResponse.json(sellerOrder({ status: 'COMPLETED' }));
      }),
    );
    renderOrder([sellerOrder({ id: 'so1', status: 'SHIPPED' })]);

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm receipt' }));

    expect(await screen.findByText('Shipment marked as completed')).toBeInTheDocument();
    expect(completed).toBe(true);
  });
});
