import { useState } from 'react';

import { useChannel } from '../../hooks/use-channel';
import type { AuctionStatePayload, ProductStockPayload } from '../../lib/ws/ws-events';

/** The stock shown for a fixed-price product, replaced by every pushed or resynced value. */
export function useLiveStock(productId: string, initial: number): number {
  const [live, setLive] = useState<{ productId: string; stock: number } | null>(null);
  const apply = (state: ProductStockPayload | AuctionStatePayload) => {
    if ('stock' in state) {
      setLive({ productId, stock: state.stock });
    }
  };
  useChannel('product', productId, apply, apply);
  return live?.productId === productId ? live.stock : initial;
}
