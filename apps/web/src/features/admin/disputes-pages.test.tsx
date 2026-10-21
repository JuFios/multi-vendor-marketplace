import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { order, sellerOrder } from '../../test/fixtures';
import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { AdminDisputeDetailsPage } from './disputes-pages';

const dispute = {
  id: 'd1',
  orderId: 'o1',
  sellerOrderId: 'so1',
  customerId: 'u1',
  sellerId: 's1',
  reason: 'Box was empty',
  status: 'UNDER_REVIEW',
  resolutionNote: null,
  resolvedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  messages: [],
};

function renderDispute(status = 'UNDER_REVIEW') {
  server.use(
    http.get('/api/disputes/d1', () => HttpResponse.json({ ...dispute, status })),
    http.get('/api/admin/orders/o1', () =>
      HttpResponse.json(order([sellerOrder({ id: 'so1', status: 'SHIPPED' })])),
    ),
  );
  renderAt(<AdminDisputeDetailsPage />, '/admin/disputes/d1', '/admin/disputes/:id');
}

describe('AdminDisputeDetailsPage', () => {
  it('resolves in favour of the buyer with a refund and a final status', async () => {
    let body: unknown;
    let key: string | null = null;
    server.use(
      http.post('/api/admin/disputes/d1/resolve', async ({ request }) => {
        body = await request.json();
        key = request.headers.get('Idempotency-Key');
        return HttpResponse.json({});
      }),
    );
    renderDispute();
    const quantity = await screen.findByLabelText('Refund quantity of Keyboard');

    await userEvent.clear(quantity);
    await userEvent.type(quantity, '1');
    await userEvent.selectOptions(
      screen.getByLabelText('Final status of the shipment'),
      'CANCELLED',
    );
    await userEvent.type(screen.getByLabelText('Note for both parties'), 'Damaged in transit');
    await userEvent.click(screen.getByRole('button', { name: 'Resolve dispute' }));

    expect(await screen.findByText('Dispute resolved')).toBeInTheDocument();
    expect(body).toEqual({
      outcome: 'RESOLVED_BUYER_FAVOR',
      note: 'Damaged in transit',
      refundItems: [{ sellerOrderItemId: 'i1', quantity: 1 }],
      sellerOrderFinalStatus: 'CANCELLED',
    });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hides refund controls when the seller wins', async () => {
    renderDispute();
    await screen.findByLabelText('Refund quantity of Keyboard');

    await userEvent.click(screen.getByLabelText('In favour of the seller'));

    expect(screen.queryByLabelText('Refund quantity of Keyboard')).toBeNull();
    expect(screen.queryByLabelText('Final status of the shipment')).toBeNull();
  });

  it('does not send a resolution without a note', async () => {
    let posted = false;
    server.use(
      http.post('/api/admin/disputes/d1/resolve', () => {
        posted = true;
        return HttpResponse.json({});
      }),
    );
    renderDispute();

    await userEvent.click(await screen.findByRole('button', { name: 'Resolve dispute' }));

    expect(await screen.findByText('Write a note for both parties.')).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('takes an open dispute into review', async () => {
    let reviewed = false;
    server.use(
      http.post('/api/admin/disputes/d1/review', () => {
        reviewed = true;
        return HttpResponse.json({ ...dispute, status: 'UNDER_REVIEW' });
      }),
    );
    renderDispute('OPEN');

    await userEvent.click(await screen.findByRole('button', { name: 'Take into review' }));

    expect(await screen.findByText('Dispute taken into review')).toBeInTheDocument();
    expect(reviewed).toBe(true);
    expect(await screen.findByRole('button', { name: 'Resolve dispute' })).toBeInTheDocument();
  });
});
