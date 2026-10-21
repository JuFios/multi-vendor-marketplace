import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { SellerFinancePage } from './finance-page';

const summary = {
  grossCents: 100000,
  refundsCents: 1599,
  commissionCents: 9840,
  netCents: 88561,
  paidOutCents: 50000,
  balanceCents: 38561,
};

describe('SellerFinancePage', () => {
  it('shows the figures of the ledger for the period', async () => {
    const seen: { from: string | null; to: string | null }[] = [];
    server.use(
      http.get('/api/seller/finance', ({ request }) => {
        const url = new URL(request.url);
        seen.push({ from: url.searchParams.get('from'), to: url.searchParams.get('to') });
        return HttpResponse.json(summary);
      }),
    );
    renderAt(<SellerFinancePage />);

    expect(await screen.findByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('$885.61')).toBeInTheDocument();
    expect(screen.getByText('$385.61')).toBeInTheDocument();
    expect(seen[0]?.from).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(seen[0]?.to ?? '').getTime()).toBeGreaterThan(
      new Date(seen[0]?.from ?? '').getTime(),
    );
  });

  it('reloads when another period is applied', async () => {
    const froms: (string | null)[] = [];
    server.use(
      http.get('/api/seller/finance', ({ request }) => {
        froms.push(new URL(request.url).searchParams.get('from'));
        return HttpResponse.json(summary);
      }),
    );
    renderAt(<SellerFinancePage />);
    await screen.findByText('$1,000.00');

    const from = screen.getByLabelText('From');
    await userEvent.clear(from);
    await userEvent.type(from, '2026-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await vi.waitFor(() => {
      expect(froms).toHaveLength(2);
    });
    expect(froms[1]).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).toISOString());
  });

  it('offers a retry when the figures cannot be loaded', async () => {
    server.use(
      http.get('/api/seller/finance', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
      ),
    );
    renderAt(<SellerFinancePage />);

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
