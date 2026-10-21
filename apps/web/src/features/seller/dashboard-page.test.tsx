import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { realtimeClient, type ChannelHandlers } from '../../lib/ws/realtime';
import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { SellerDashboardPage } from './dashboard-page';

const dashboard = {
  from: '2026-01-01T00:00:00Z',
  to: '2026-01-31T00:00:00Z',
  revenue: {
    ordersCount: 4,
    itemsCount: 9,
    grossCents: 100000,
    refundsCents: 5000,
    commissionCents: 9500,
    netCents: 85500,
  },
  ordersByStatus: { NEW: 2, PROCESSING: 1, SHIPPED: 1, COMPLETED: 0, CANCELLED: 0 },
  recentOrders: [],
  activeLots: [
    {
      auctionId: 'a1',
      productId: 'p1',
      title: 'Old vase',
      currentPriceCents: 12000,
      bidCount: 2,
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  ],
};

let handlers: ChannelHandlers;

describe('SellerDashboardPage', () => {
  beforeEach(() => {
    vi.spyOn(realtimeClient, 'follow').mockImplementation((_request, next) => {
      handlers = next;
      return () => undefined;
    });
    server.use(http.get('/api/seller/dashboard', () => HttpResponse.json(dashboard)));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows revenue figures and order counts', async () => {
    renderAt(<SellerDashboardPage />);

    expect(await screen.findByText('Net revenue')).toBeInTheDocument();
    expect(screen.getByText('$855.00')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
  });

  it('updates an active lot from the auction channel', async () => {
    renderAt(<SellerDashboardPage />);
    const lot = (await screen.findByText('Old vase')).closest('li');
    expect(lot).toHaveTextContent('$120.00 · 2 bids');

    act(() => {
      handlers.onSnapshot({
        auctionId: 'a1',
        productId: 'p1',
        round: 1,
        status: 'ACTIVE',
        currentPriceCents: 12000,
        minNextBidCents: 12500,
        bidCount: 2,
        leader: null,
        endsAt: dashboard.activeLots[0]!.endsAt,
        winnerDeadlineAt: null,
        version: 3,
        serverTime: new Date().toISOString(),
      });
      handlers.onEvent({
        auctionId: 'a1',
        productId: 'p1',
        round: 1,
        status: 'ACTIVE',
        currentPriceCents: 13000,
        minNextBidCents: 13500,
        bidCount: 3,
        leader: null,
        endsAt: dashboard.activeLots[0]!.endsAt,
        winnerDeadlineAt: null,
        version: 4,
        serverTime: new Date().toISOString(),
      });
    });

    await vi.waitFor(() => {
      expect(lot).toHaveTextContent('$130.00 · 3 bids');
    });
  });

  it('shows an error state with retry', async () => {
    server.use(
      http.get('/api/seller/dashboard', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
      ),
    );
    renderAt(<SellerDashboardPage />);

    expect(await screen.findByText('Could not load the dashboard.')).toBeInTheDocument();
  });
});
