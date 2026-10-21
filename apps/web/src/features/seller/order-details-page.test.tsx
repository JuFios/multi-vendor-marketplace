import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { sellerOrder } from '../../test/fixtures';
import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { SellerOrderDetailsPage } from './order-details-page';

function renderOrder(overrides: Record<string, unknown> = {}) {
  server.use(http.get('/api/seller/orders/so1', () => HttpResponse.json(sellerOrder(overrides))));
  renderAt(<SellerOrderDetailsPage />, '/seller/orders/so1', '/seller/orders/:id');
}

describe('SellerOrderDetailsPage', () => {
  it('offers the next status step for the current status only', async () => {
    renderOrder({ status: 'NEW' });
    expect(await screen.findByRole('button', { name: 'Start processing' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Mark as shipped' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refund items' })).toBeNull();
  });

  it('waits for the payment before processing starts', async () => {
    renderOrder({ status: 'NEW', paymentStatus: 'PENDING' });

    expect(await screen.findByRole('button', { name: 'Start processing' })).toBeDisabled();
  });

  it('marks a processing shipment as shipped', async () => {
    let body: unknown;
    server.use(
      http.post('/api/seller/orders/so1/status', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(sellerOrder({ status: 'SHIPPED' }));
      }),
    );
    renderOrder({ status: 'PROCESSING' });

    await userEvent.click(await screen.findByRole('button', { name: 'Mark as shipped' }));

    await screen.findByText('Status updated');
    expect(body).toEqual({ status: 'SHIPPED' });
  });

  it('requires a reason to cancel', async () => {
    let body: unknown;
    server.use(
      http.post('/api/seller/orders/so1/cancel', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(sellerOrder({ status: 'CANCELLED' }));
      }),
    );
    renderOrder({ status: 'PROCESSING' });

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel shipment' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Cancel shipment' });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Out of stock');
    await userEvent.click(confirm);

    await screen.findByText('Shipment cancelled');
    expect(body).toEqual({ reason: 'Out of stock' });
  });

  it('previews the commission and sends the partial refund with an idempotency key', async () => {
    let body: unknown;
    let key: string | null = null;
    server.use(
      http.post('/api/seller/orders/so1/refunds', async ({ request }) => {
        body = await request.json();
        key = request.headers.get('Idempotency-Key');
        return HttpResponse.json(
          { amountCents: 1000, refunds: [], sellerOrder: sellerOrder() },
          { status: 201 },
        );
      }),
    );
    renderOrder({ status: 'SHIPPED' });

    await userEvent.click(await screen.findByRole('button', { name: 'Refund items' }));
    const dialog = await screen.findByRole('dialog');
    const quantity = within(dialog).getByLabelText('Refund quantity of Keyboard');
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '1');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Damaged');

    const preview = within(dialog).getByLabelText('Refund preview');
    expect(preview).toHaveTextContent('Refund to the buyer$10.00');
    expect(preview).toHaveTextContent('Commission after refund$1.00');
    expect(preview).toHaveTextContent('Your payout after refund$9.00');

    await userEvent.click(within(dialog).getByRole('button', { name: /^Refund/ }));

    await screen.findByText('Refund issued');
    expect(body).toEqual({ items: [{ sellerOrderItemId: 'i1', quantity: 1 }], reason: 'Damaged' });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });
});
