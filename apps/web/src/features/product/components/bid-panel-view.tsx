import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Countdown } from '../../../components/countdown';
import { Input } from '../../../components/input';
import { Money } from '../../../components/money';
import { StatusBadge } from '../../../components/status-badge';
import { formatDateTime } from '../../../lib/format';
import { dollarsToCents, formatMoney } from '../../../lib/money';
import type { ConnectionStatus } from '../../../lib/ws/realtime';
import { bidSchema } from '../bid-schema';
import type { AuctionState, Bid } from '../product-api';

export interface BidPanelViewProps {
  auction: AuctionState;
  bids: readonly Bid[] | undefined;
  connection: ConnectionStatus;
  signedIn: boolean;
  isWinner: boolean;
  pending: boolean;
  error: string | null;
  onBid: (amountCents: number) => void;
}

function BidForm({
  minimumCents,
  pending,
  onBid,
}: {
  minimumCents: number;
  pending: boolean;
  onBid: (amountCents: number) => void;
}) {
  const schema = useMemo(() => bidSchema(minimumCents), [minimumCents]);
  const form = useForm<{ amount: string }>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '' },
  });

  return (
    <form
      className="flex items-start gap-2"
      noValidate
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          const cents = dollarsToCents(values.amount);
          if (cents !== null) {
            onBid(cents);
          }
        })(event);
      }}
    >
      <div className="flex-1">
        <Input
          label="Your bid"
          inputMode="decimal"
          placeholder={(minimumCents / 100).toFixed(2)}
          error={form.formState.errors.amount?.message}
          {...form.register('amount')}
        />
      </div>
      <Button type="submit" loading={pending} className="mt-6">
        Place bid
      </Button>
    </form>
  );
}

function Outcome({ auction, isWinner }: { auction: AuctionState; isWinner: boolean }) {
  switch (auction.status) {
    case 'SOLD_TO_WINNER':
      if (isWinner) {
        return (
          <div className="space-y-2 rounded-md bg-emerald-50 p-3 text-sm">
            <p className="font-medium text-ok">You won this lot!</p>
            {auction.winnerDeadlineAt !== null ? (
              <p>Check out before {formatDateTime(auction.winnerDeadlineAt)}.</p>
            ) : null}
            <Link to="/cart" className="inline-block font-medium text-brand">
              Go to cart
            </Link>
          </div>
        );
      }
      return (
        <p className="text-sm text-muted">
          The auction has ended and the winner is completing the purchase. If they do not check out
          in time, the lot goes back on sale.
        </p>
      );
    case 'ORDERED':
      return <p className="text-sm text-muted">This lot has been sold.</p>;
    case 'NOT_SOLD':
      return <p className="text-sm text-muted">This lot was not sold.</p>;
    default:
      return null;
  }
}

export function BidPanelView({
  auction,
  bids,
  connection,
  signedIn,
  isWinner,
  pending,
  error,
  onBid,
}: BidPanelViewProps) {
  const active = auction.status === 'ACTIVE';
  const minimum = auction.minNextBidCents ?? auction.startPriceCents;

  return (
    <Card className="space-y-4">
      {connection !== 'connected' ? (
        <p role="status" className="rounded-md bg-amber-50 p-2 text-sm text-warn">
          {connection === 'connecting' ? 'Reconnecting…' : 'You are offline.'} Live updates are
          paused; the latest state loads automatically when the connection returns.
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {auction.currentPriceCents === null ? 'Starting price' : 'Current bid'}
          </p>
          <p className="text-2xl font-semibold">
            <Money cents={auction.currentPriceCents ?? auction.startPriceCents} />
          </p>
          <p className="text-xs text-muted">
            {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          </p>
        </div>
        <div className="text-right">
          <StatusBadge status={auction.status} />
          {active ? (
            <p className="mt-2 text-sm">
              Ends in <Countdown endsAt={auction.endsAt} serverTime={auction.serverTime} />
            </p>
          ) : null}
        </div>
      </div>

      {active ? (
        signedIn ? (
          <div className="space-y-1">
            <p className="text-sm text-muted">Minimum next bid: {formatMoney(minimum)}</p>
            <BidForm minimumCents={minimum} pending={pending} onBid={onBid} />
          </div>
        ) : (
          <p className="text-sm">
            <Link to="/login" className="font-medium text-brand">
              Log in
            </Link>{' '}
            to place a bid.
          </p>
        )
      ) : (
        <Outcome auction={auction} isWinner={isWinner} />
      )}

      {error !== null ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div>
        <h3 className="mb-1 text-sm font-semibold">Bid history</h3>
        {bids === undefined ? (
          <p className="text-sm text-muted">Loading bids…</p>
        ) : bids.length === 0 ? (
          <p className="text-sm text-muted">No bids yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {bids.map((bid) => (
              <li key={bid.id} className="flex items-center justify-between py-1">
                <span>
                  {bid.isOwn ? <strong>You</strong> : bid.bidder}
                  <span className="ml-2 text-xs text-muted">{formatDateTime(bid.createdAt)}</span>
                </span>
                <Money cents={bid.amountCents} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
