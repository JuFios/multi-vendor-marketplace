import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { SellerAuctionsPage } from './auctions-page';

const auction = {
  id: 'a1',
  productId: 'p1',
  sellerId: 's1',
  status: 'ACTIVE',
  round: 1,
  startPriceCents: 10000,
  bidStepCents: 500,
  currentPriceCents: 12000,
  minNextBidCents: 12500,
  bidCount: 2,
  leader: null,
  endsAt: '2026-06-01T10:00:00Z',
  winnerDeadlineAt: null,
  version: 3,
  serverTime: '2026-05-30T10:00:00Z',
};

describe('SellerAuctionsPage', () => {
  it('names every lot by its product title', async () => {
    server.use(
      http.get('/api/seller/auctions', () =>
        HttpResponse.json({ items: [auction], total: 1, page: 1, limit: 10 }),
      ),
      http.get('/api/seller/products', () =>
        HttpResponse.json({ items: [{ id: 'p1', title: 'Vintage Camera' }], total: 1 }),
      ),
    );
    renderAt(<SellerAuctionsPage />);

    expect(await screen.findByRole('link', { name: 'Vintage Camera' })).toHaveAttribute(
      'href',
      '/products/p1',
    );
  });

  it('shows the heading and a way to start a lot when there are none', async () => {
    server.use(
      http.get('/api/seller/auctions', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 10 }),
      ),
      http.get('/api/seller/products', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderAt(<SellerAuctionsPage />);

    expect(await screen.findByText('No auction lots')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Auctions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New product' })).toHaveAttribute(
      'href',
      '/seller/products/new',
    );
  });
});
