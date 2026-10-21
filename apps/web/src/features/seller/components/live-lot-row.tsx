import { useState } from 'react';
import { Link } from 'react-router';

import { Countdown } from '../../../components/countdown';
import { Money } from '../../../components/money';
import { useChannel } from '../../../hooks/use-channel';
import type { AuctionStatePayload, ProductStockPayload } from '../../../lib/ws/ws-events';

interface LiveLotRowProps {
  auctionId: string;
  productId: string;
  title: string;
  currentPriceCents: number;
  bidCount: number;
  endsAt: string;
  serverTime: string;
}

/** One active lot whose price and bid count follow the auction channel. */
export function LiveLotRow(props: LiveLotRowProps) {
  const [live, setLive] = useState<Pick<
    AuctionStatePayload,
    'currentPriceCents' | 'bidCount' | 'endsAt' | 'serverTime'
  > | null>(null);
  const apply = (state: AuctionStatePayload | ProductStockPayload) => {
    if ('auctionId' in state) {
      setLive({
        currentPriceCents: state.currentPriceCents,
        bidCount: state.bidCount,
        endsAt: state.endsAt,
        serverTime: state.serverTime,
      });
    }
  };
  useChannel('auction', props.auctionId, apply, apply);

  const price = live?.currentPriceCents ?? props.currentPriceCents;
  const bids = live?.bidCount ?? props.bidCount;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <Link
        to={`/products/${props.productId}`}
        className="min-w-40 flex-1 font-medium hover:underline"
      >
        {props.title}
      </Link>
      <span>
        <Money cents={price} /> · {bids} {bids === 1 ? 'bid' : 'bids'}
      </span>
      <Countdown
        endsAt={live?.endsAt ?? props.endsAt}
        serverTime={live?.serverTime ?? props.serverTime}
      />
    </li>
  );
}
