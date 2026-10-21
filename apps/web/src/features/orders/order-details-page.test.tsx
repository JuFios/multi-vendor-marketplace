import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { order, sellerOrder } from '../../test/fixtures';
import { renderRoutes } from '../../test/render';
import { server } from '../../test/server';

import { OrderDetailsPage } from './order-details-page';

function renderDetails(data: ReturnType<typeof order>) {
  server.use(
    http.get('/api/orders/o1', () => HttpResponse.json(data)),
    http.get('/api/disputes', () => HttpResponse.json({ items: [], total: 0, page: 1, limit: 50 })),
  );
  return renderRoutes(
    [
      { path: '/account/orders/:id', element: <OrderDetailsPage /> },
      { path: '/account/disputes/:id', element: <p>dispute thread</p> },
    ],
    '/account/orders/o1',
  );
}

describe('OrderDetailsPage', () => {
  it('lets the buyer cancel only a shipment that is still new', async () => {
    renderDetails(
      order([
        sellerOrder({ id: 'so1', status: 'NEW' }),
        sellerOrder({ id: 'so2', status: 'PROCESSING', seller: { id: 's2', name: 'AudioHub' } }),
      ]),
    );
    const fresh = await screen.findByLabelText('Shipment from KeyShop');
    const processing = screen.getByLabelText('Shipment from AudioHub');

    expect(within(fresh).getByRole('button', { name: 'Cancel shipment' })).toBeInTheDocument();
    expect(within(processing).queryByRole('button', { name: 'Cancel shipment' })).toBeNull();
    expect(within(processing).getByRole('button', { name: 'Open a dispute' })).toBeInTheDocument();
  });

  it('cancels a shipment after confirmation', async () => {
    let cancelled = false;
    server.use(
      http.post('/api/orders/o1/seller-orders/so1/cancel', () => {
        cancelled = true;
        return HttpResponse.json(sellerOrder({ status: 'CANCELLED' }));
      }),
    );
    renderDetails(order());
    const card = await screen.findByLabelText('Shipment from KeyShop');

    await userEvent.click(within(card).getByRole('button', { name: 'Cancel shipment' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel shipment' }));

    await screen.findByText('Shipment cancelled');
    expect(cancelled).toBe(true);
  });

  it('confirms receipt of a shipped shipment', async () => {
    let confirmed = false;
    server.use(
      http.post('/api/orders/o1/seller-orders/so1/confirm-receipt', () => {
        confirmed = true;
        return HttpResponse.json(sellerOrder({ status: 'COMPLETED' }));
      }),
    );
    renderDetails(order([sellerOrder({ status: 'SHIPPED' })]));

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm receipt' }));

    await screen.findByText('Receipt confirmed');
    expect(confirmed).toBe(true);
  });

  it('explains why a product cannot be reviewed twice', async () => {
    server.use(
      http.get('/api/products/p1/reviews/eligibility', () =>
        HttpResponse.json({ eligible: false, reason: 'ALREADY_REVIEWED' }),
      ),
    );
    renderDetails(order([sellerOrder({ status: 'COMPLETED' })]));

    await userEvent.click(await screen.findByRole('button', { name: 'Review Keyboard' }));

    expect(await screen.findByText('You have already reviewed this product.')).toBeInTheDocument();
  });

  it('submits a review for an eligible product', async () => {
    let body: unknown;
    server.use(
      http.get('/api/products/p1/reviews/eligibility', () => HttpResponse.json({ eligible: true })),
      http.post('/api/products/p1/reviews', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'r1' }, { status: 201 });
      }),
    );
    renderDetails(order([sellerOrder({ status: 'COMPLETED' })]));

    await userEvent.click(await screen.findByRole('button', { name: 'Review Keyboard' }));
    await userEvent.type(await screen.findByLabelText('Your review'), 'Great keys');
    await userEvent.click(screen.getByRole('button', { name: 'Publish review' }));

    await screen.findByText('Thank you for your review');
    expect(body).toEqual({ rating: 5, text: 'Great keys' });
  });

  it('opens a dispute and goes to its thread', async () => {
    server.use(
      http.post('/api/disputes', () =>
        HttpResponse.json({ id: 'd1', status: 'OPEN' }, { status: 201 }),
      ),
    );
    renderDetails(order([sellerOrder({ status: 'SHIPPED' })]));

    await userEvent.click(await screen.findByRole('button', { name: 'Open a dispute' }));
    await userEvent.type(await screen.findByLabelText('What went wrong?'), 'Box was empty');
    await userEvent.click(screen.getByRole('button', { name: 'Open dispute' }));

    expect(await screen.findByText('dispute thread')).toBeInTheDocument();
  });
});
