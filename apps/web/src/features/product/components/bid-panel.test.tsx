import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionStore } from '../../../lib/session';
import { realtimeClient, type ChannelHandlers } from '../../../lib/ws/realtime';
import type { AuctionStatePayload } from '../../../lib/ws/ws-events';
import { server } from '../../../test/server';

import { BidPanel } from './bid-panel';

const AUCTION_ID = 'a1';

const auction = {
  id: AUCTION_ID,
  productId: 'p1',
  sellerId: 's1',
  status: 'ACTIVE',
  round: 1,
  startPriceCents: 10000,
  bidStepCents: 500,
  currentPriceCents: 12000,
  minNextBidCents: 12500,
  bidCount: 2,
  leader: 'Bidder #ab12',
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
  winnerDeadlineAt: null,
  version: 3,
  serverTime: new Date().toISOString(),
};

const bidsPage = {
  items: [
    {
      id: 'b2',
      round: 1,
      amountCents: 12000,
      bidder: 'Bidder #ab12',
      isOwn: false,
      createdAt: auction.serverTime,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

function event(overrides: Partial<AuctionStatePayload>): AuctionStatePayload {
  return {
    auctionId: AUCTION_ID,
    productId: 'p1',
    round: 1,
    status: 'ACTIVE',
    currentPriceCents: 12000,
    minNextBidCents: 12500,
    bidCount: 2,
    leader: 'Bidder #ab12',
    endsAt: auction.endsAt,
    winnerDeadlineAt: null,
    version: 3,
    serverTime: auction.serverTime,
    ...overrides,
  };
}

let handlers: ChannelHandlers;

function renderPanel() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <BidPanel auctionId={AUCTION_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BidPanel', () => {
  beforeEach(() => {
    vi.spyOn(realtimeClient, 'follow').mockImplementation((_request, next) => {
      handlers = next;
      return () => undefined;
    });
    sessionStore.setSession({
      accessToken: 'jwt',
      user: { id: 'u1', email: 'a@b.co', name: 'A', roles: ['CUSTOMER'], emailVerified: true },
    });
    server.use(
      http.get(`/api/auctions/${AUCTION_ID}`, () => HttpResponse.json(auction)),
      http.get(`/api/auctions/${AUCTION_ID}/bids`, () => HttpResponse.json(bidsPage)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStore.setSession(null);
  });

  it('rejects a bid below the minimum without calling the api', async () => {
    let posted = false;
    server.use(
      http.post(`/api/auctions/${AUCTION_ID}/bids`, () => {
        posted = true;
        return HttpResponse.json({});
      }),
    );
    renderPanel();
    await screen.findByText('Minimum next bid: $125.00');

    await userEvent.type(screen.getByLabelText('Your bid'), '120');
    await userEvent.click(screen.getByRole('button', { name: 'Place bid' }));

    expect(await screen.findByText('Minimum bid is $125.00')).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('shows a live update and ignores an older version', async () => {
    renderPanel();
    await screen.findByText('Minimum next bid: $125.00');
    handlers.onSnapshot(event({ version: 3 }));

    handlers.onEvent(
      event({ version: 4, currentPriceCents: 13000, minNextBidCents: 13500, bidCount: 3 }),
    );
    expect(await screen.findByText('Minimum next bid: $135.00')).toBeInTheDocument();

    handlers.onEvent(event({ version: 3, currentPriceCents: 12000, minNextBidCents: 12500 }));
    expect(screen.getByText('Minimum next bid: $135.00')).toBeInTheDocument();
    expect(screen.getByText('3 bids')).toBeInTheDocument();
  });

  it('reuses the idempotency key when the same bid is retried after a server error', async () => {
    const keys: (string | null)[] = [];
    let attempt = 0;
    server.use(
      http.post(`/api/auctions/${AUCTION_ID}/bids`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: { code: 'INTERNAL', message: 'boom' } },
            { status: 500 },
          );
        }
        return HttpResponse.json(
          {
            bid: { ...bidsPage.items[0], id: 'b3', amountCents: 13000, isOwn: true },
            auction: { ...auction, version: 4, currentPriceCents: 13000, minNextBidCents: 13500 },
          },
          { status: 201 },
        );
      }),
    );
    renderPanel();
    await screen.findByText('Minimum next bid: $125.00');
    await userEvent.type(screen.getByLabelText('Your bid'), '130');

    await userEvent.click(screen.getByRole('button', { name: 'Place bid' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Place bid' }));

    expect(await screen.findByText('Minimum next bid: $135.00')).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('explains BID_TOO_LOW with the fresh minimum and uses a new key afterwards', async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.post(`/api/auctions/${AUCTION_ID}/bids`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(
          {
            error: {
              code: 'BID_TOO_LOW',
              message: 'low',
              details: { minNextBidCents: 14000 },
            },
          },
          { status: 422 },
        );
      }),
    );
    renderPanel();
    await screen.findByText('Minimum next bid: $125.00');

    await userEvent.type(screen.getByLabelText('Your bid'), '126');
    await userEvent.click(screen.getByRole('button', { name: 'Place bid' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/minimum is now \$140\.00/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Place bid' }));
    await vi.waitFor(() => {
      expect(keys).toHaveLength(2);
    });
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('shows the winner call to action after the auction closes', async () => {
    server.use(
      http.get(`/api/auctions/${AUCTION_ID}/bids`, () =>
        HttpResponse.json({
          ...bidsPage,
          items: [{ ...bidsPage.items[0], isOwn: true }],
        }),
      ),
    );
    renderPanel();
    await screen.findByText('Minimum next bid: $125.00');
    handlers.onSnapshot(event({ version: 3 }));

    handlers.onEvent(
      event({
        version: 5,
        status: 'SOLD_TO_WINNER',
        winnerDeadlineAt: new Date(Date.now() + 1_800_000).toISOString(),
      }),
    );

    expect(await screen.findByText('You won this lot!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to cart' })).toBeInTheDocument();
  });
});
