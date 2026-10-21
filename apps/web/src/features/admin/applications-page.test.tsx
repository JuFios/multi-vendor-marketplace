import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { ApplicationsPage } from './applications-page';

const application = {
  id: 'a1',
  userId: 'u1',
  storeName: 'KeyShop',
  description: 'Keyboards',
  status: 'PENDING',
  rejectionReason: null,
  moderatedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

function listPending() {
  server.use(
    http.get('/api/admin/seller-applications', () =>
      HttpResponse.json({ items: [application], total: 1, page: 1, limit: 10 }),
    ),
  );
}

describe('ApplicationsPage', () => {
  it('approves a pending application', async () => {
    let approved = false;
    listPending();
    server.use(
      http.post('/api/admin/seller-applications/a1/approve', () => {
        approved = true;
        return HttpResponse.json({ ...application, status: 'APPROVED' });
      }),
    );
    renderAt(<ApplicationsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve KeyShop' }));

    expect(await screen.findByText('Seller approved')).toBeInTheDocument();
    expect(approved).toBe(true);
  });

  it('requires a reason to reject and sends it', async () => {
    let body: unknown;
    listPending();
    server.use(
      http.post('/api/admin/seller-applications/a1/reject', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...application, status: 'REJECTED' });
      }),
    );
    renderAt(<ApplicationsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reject KeyShop' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reject application' });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Incomplete description');
    await userEvent.click(confirm);

    expect(await screen.findByText('Application rejected')).toBeInTheDocument();
    expect(body).toEqual({ reason: 'Incomplete description' });
  });

  it('asks the api for the chosen status', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('/api/admin/seller-applications', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('status'));
        return HttpResponse.json({ items: [], total: 0, page: 1, limit: 10 });
      }),
    );
    renderAt(<ApplicationsPage />);
    await screen.findByText('No applications');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'REJECTED');

    await vi.waitFor(() => {
      expect(seen).toContain('REJECTED');
    });
    expect(seen[0]).toBe('PENDING');
  });
});
