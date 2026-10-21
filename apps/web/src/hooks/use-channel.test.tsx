import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { realtimeClient, type ChannelHandlers } from '../lib/ws/realtime';
import type { ProductStockPayload } from '../lib/ws/ws-events';

import { useChannel } from './use-channel';

const stock = (version: number, value = 1): ProductStockPayload => ({
  productId: 'p1',
  stock: value,
  inStock: value > 0,
  version,
});

function setup() {
  let handlers!: ChannelHandlers;
  const unfollow = vi.fn();
  vi.spyOn(realtimeClient, 'follow').mockImplementation((_request, next) => {
    handlers = next;
    return unfollow;
  });
  const onSnapshot = vi.fn();
  const onEvent = vi.fn();
  const hook = renderHook(() => {
    useChannel('product', 'p1', onSnapshot, onEvent);
  });
  return {
    get handlers() {
      return handlers;
    },
    onSnapshot,
    onEvent,
    unfollow,
    hook,
  };
}

describe('useChannel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores events with a stale or duplicate version', () => {
    const { handlers, onEvent } = setup();

    handlers.onSnapshot(stock(5));
    handlers.onEvent(stock(4));
    handlers.onEvent(stock(5));
    handlers.onEvent(stock(6, 0));
    handlers.onEvent(stock(6, 0));

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(stock(6, 0));
  });

  it('accepts a lower version after a new snapshot replaces the local state', () => {
    const { handlers, onSnapshot, onEvent } = setup();

    handlers.onSnapshot(stock(9));
    handlers.onSnapshot(stock(2));
    handlers.onEvent(stock(3));

    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('unfollows the channel on unmount', () => {
    const { hook, unfollow } = setup();

    hook.unmount();

    expect(unfollow).toHaveBeenCalledTimes(1);
  });
});
