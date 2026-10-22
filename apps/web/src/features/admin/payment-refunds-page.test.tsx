import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { PaymentRefundsPage } from './payment-refunds-page';

const STORE = '11111111-1111-4111-8111-111111111111';
const ORDER = '33333333-3333-4333-8333-333333333333';

const refund = (id: string, status: 'FAILED' | 'REFUNDED', amountCents: number) => ({
  id,
  refundKey: '44444444-4444-4444-8444-444444444444',
  sellerOrderId: 'aaaaaaaa-0000-4000-8000-000000000000',
  orderId: ORDER,
  sellerId: STORE,
  amountCents,
  status,
  providerRef: status === 'REFUNDED' ? 'prov_123' : null,
  failureReason: status === 'FAILED' ? 'CARD_CLOSED' : null,
  createdAt: '2026-01-01T10:00:00Z',
});

function mockApi(items: ReturnType<typeof refund>[], onList?: (params: URLSearchParams) => void) {
  server.use(
    http.get('/api/admin/seller-applications', () =>
      HttpResponse.json({
        items: [{ id: STORE, storeName: 'Tech Hub' }],
        total: 1,
        page: 1,
        limit: 100,
      }),
    ),
    http.get('/api/admin/payment-refunds', ({ request }) => {
      onList?.(new URL(request.url).searchParams);
      return HttpResponse.json({ items, total: items.length, page: 1, limit: 20 });
    }),
  );
}

describe('PaymentRefundsPage', () => {
  it('lists the refused refunds by default, with the store, amount, reason and order', async () => {
    const seen: (string | null)[] = [];
    mockApi([refund('r1', 'FAILED', 40_197)], (params) => seen.push(params.get('status')));
    renderAt(<PaymentRefundsPage />);

    const row = (await screen.findByText('Refused')).closest('tr') as HTMLElement;
    expect(within(row).getByText('$401.97')).toBeInTheDocument();
    expect(within(row).getByText('CARD_CLOSED')).toBeInTheDocument();
    expect(await within(row).findByText('Tech Hub')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Open order' })).toHaveAttribute(
      'href',
      `/admin/orders/${ORDER}`,
    );
    expect(seen[0]).toBe('FAILED');
  });

  it('can show every outcome', async () => {
    const seen: (string | null)[] = [];
    mockApi([refund('r2', 'REFUNDED', 13_399)], (params) => seen.push(params.get('status')));
    renderAt(<PaymentRefundsPage />);
    await screen.findByText('Paid back', { selector: 'td' });

    await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'all');

    await vi.waitFor(() => {
      expect(seen).toContain(null);
    });
  });

  it('says so when nothing was refused', async () => {
    mockApi([]);
    renderAt(<PaymentRefundsPage />);

    expect(await screen.findByText('No refused refunds')).toBeInTheDocument();
  });
});
