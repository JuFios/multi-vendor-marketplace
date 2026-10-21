import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../components/toast';
import { sessionStore } from '../../lib/session';
import { realtimeClient } from '../../lib/ws/realtime';
import { WS_EVENT, type WsEventName } from '../../lib/ws/ws-events';

import { RealtimeProvider } from './realtime-provider';

let emit: (event: WsEventName, payload: unknown) => void;
let fetches = 0;

function OrderProbe() {
  const order = useQuery({
    queryKey: ['order', 'o1'],
    queryFn: () => Promise.resolve({ fetch: ++fetches }),
  });
  return <p>fetches: {order.data?.fetch ?? 0}</p>;
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    fetches = 0;
    vi.spyOn(realtimeClient, 'connect').mockImplementation(() => undefined);
    vi.spyOn(realtimeClient, 'disconnect').mockImplementation(() => undefined);
    vi.spyOn(realtimeClient, 'onUserEvent').mockImplementation((listener) => {
      emit = listener;
      return () => undefined;
    });
    sessionStore.setSession({
      accessToken: 'jwt',
      user: { id: 'u1', email: 'a@b.co', name: 'A', roles: ['CUSTOMER'], emailVerified: true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStore.setSession(null);
  });

  it.each([
    [WS_EVENT.ORDER_STATUS, { orderId: 'o1', status: 'SHIPPED', version: 2 }],
    [
      WS_EVENT.SELLER_ORDER_STATUS,
      { sellerOrderId: 'so1', orderId: 'o1', status: 'PROCESSING', version: 1 },
    ],
  ])('refetches the order on a live %s push', async (wsEvent, payload) => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <RealtimeProvider>
            <OrderProbe />
          </RealtimeProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('fetches: 1')).toBeInTheDocument();

    act(() => {
      emit(wsEvent, payload);
    });

    expect(await screen.findByText('fetches: 2')).toBeInTheDocument();
  });

  it('announces a notification as a toast', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <RealtimeProvider>
            <p>page</p>
          </RealtimeProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    act(() => {
      emit(WS_EVENT.NOTIFICATION, {
        id: 'n1',
        type: 'seller_order.status_changed',
        payload: {},
        createdAt: '2026-01-01T00:00:00Z',
      });
    });

    expect(await screen.findByText('Seller order status changed')).toBeInTheDocument();
  });

  it('announces a new order to the seller', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <RealtimeProvider>
            <p>page</p>
          </RealtimeProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    act(() => {
      emit(WS_EVENT.SELLER_ORDER_CREATED, {
        sellerOrderId: 'so1',
        orderId: 'o1',
        status: 'NEW',
        amountCents: 1000,
        version: 1,
      });
    });

    expect(await screen.findByText('New order received')).toBeInTheDocument();
  });
});
