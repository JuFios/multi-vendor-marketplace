import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveBlob } from '../../lib/download';
import { salesChart, summary } from '../../test/analytics-fixtures';
import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { AnalyticsPage } from './analytics-page';
import { defaultPeriod } from './period';

vi.mock('../../lib/download', () => ({ saveBlob: vi.fn() }));

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.mocked(saveBlob).mockClear();
    server.use(
      http.get('/api/admin/analytics/summary', () => HttpResponse.json(summary)),
      http.get('/api/admin/analytics/sales-chart', () => HttpResponse.json(salesChart)),
    );
  });

  it('shows the KPIs, seller revenue and the comparison delta', async () => {
    renderAt(<AnalyticsPage />);

    expect(await screen.findByText('$465.00')).toBeInTheDocument();
    expect(await screen.findByText('58.0%')).toBeInTheDocument();
    expect(await screen.findByText('+25.0%')).toBeInTheDocument();
    expect(screen.getAllByText('KeyShop').length).toBeGreaterThan(0);
  });

  it.each([
    ['Export CSV', 'csv', 'text/csv'],
    ['Export JSON', 'json', 'application/json'],
  ])('downloads the report as %s', async (label, format, type) => {
    let requested: URL | undefined;
    server.use(
      http.get('/api/admin/analytics/report', ({ request }) => {
        requested = new URL(request.url);
        return new HttpResponse(format === 'csv' ? 'section,date\n' : '{"schemaVersion":1}', {
          headers: { 'Content-Type': type },
        });
      }),
    );
    renderAt(<AnalyticsPage />);
    await screen.findByText('Cart conversion');

    await userEvent.click(screen.getByRole('button', { name: label }));

    await vi.waitFor(() => {
      expect(saveBlob).toHaveBeenCalledTimes(1);
    });
    const period = defaultPeriod();
    expect(requested?.searchParams.get('format')).toBe(format);
    expect(requested?.searchParams.get('from')).toBe(period.from);
    expect(requested?.searchParams.get('to')).toBe(period.to);
    expect(vi.mocked(saveBlob).mock.calls[0]?.[1]).toBe(
      `analytics-report_${period.from}_${period.to}.${format}`,
    );
  });

  it('shows an error state when the summary fails', async () => {
    server.use(
      http.get('/api/admin/analytics/summary', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
      ),
    );
    renderAt(<AnalyticsPage />);

    expect(await screen.findByText('Could not load the summary.')).toBeInTheDocument();
  });
});
