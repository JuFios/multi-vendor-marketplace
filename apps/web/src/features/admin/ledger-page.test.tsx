import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { LedgerPage } from './ledger-page';

const STORE_A = '11111111-1111-4111-8111-111111111111';
const STORE_B = '22222222-2222-4222-8222-222222222222';

const entry = (id: string, type: string, amountCents: number, sellerId = STORE_A) => ({
  id,
  sellerOrderId: 'aaaaaaaa-0000-4000-8000-000000000000',
  sellerId,
  type,
  amountCents,
  refId: null,
  createdAt: '2026-01-01T10:00:00Z',
});

function mockApi(onLedger?: (params: URLSearchParams) => void) {
  server.use(
    http.get('/api/admin/seller-applications', () =>
      HttpResponse.json({
        items: [
          { id: STORE_A, storeName: 'Tech Hub' },
          { id: STORE_B, storeName: 'Urban Style' },
        ],
        total: 2,
        page: 1,
        limit: 100,
      }),
    ),
    http.get('/api/admin/ledger', ({ request }) => {
      onLedger?.(new URL(request.url).searchParams);
      return HttpResponse.json({
        items: [entry('e1', 'SALE', 150000), entry('e2', 'COMMISSION', -15000, STORE_B)],
        total: 2,
        page: 1,
        limit: 20,
      });
    }),
  );
}

describe('LedgerPage', () => {
  it('lists entries with the store name, a readable type and a signed amount', async () => {
    mockApi();
    renderAt(<LedgerPage />);

    const sale = (await screen.findByText('Sale')).closest('tr');
    const commission = screen.getByText('Commission').closest('tr');
    expect(sale).not.toBeNull();
    expect(commission).not.toBeNull();
    expect(within(sale as HTMLElement).getByText('Tech Hub')).toBeInTheDocument();
    expect(within(sale as HTMLElement).getByText('$1,500.00')).toBeInTheDocument();
    expect(within(commission as HTMLElement).getByText('Urban Style')).toBeInTheDocument();
    expect(within(commission as HTMLElement).getByText('-$150.00')).toBeInTheDocument();
  });

  it('filters by store', async () => {
    const seen: (string | null)[] = [];
    mockApi((params) => seen.push(params.get('sellerId')));
    renderAt(<LedgerPage />);
    await screen.findByText('Sale');
    await screen.findByRole('option', { name: 'Urban Style' });

    await userEvent.selectOptions(screen.getByLabelText('Store'), STORE_B);

    await vi.waitFor(() => {
      expect(seen).toContain(STORE_B);
    });
    expect(seen[0]).toBeNull();
  });

  it('shows an empty state', async () => {
    server.use(
      http.get('/api/admin/seller-applications', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
      http.get('/api/admin/ledger', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 20 }),
      ),
    );
    renderAt(<LedgerPage />);

    expect(await screen.findByText('No ledger entries')).toBeInTheDocument();
  });
});
