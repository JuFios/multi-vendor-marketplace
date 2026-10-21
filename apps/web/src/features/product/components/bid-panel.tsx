import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { IdempotencySession } from '../../../lib/api/idempotency';
import { queryKeys } from '../../../lib/query-keys';
import { useConnectionStatus } from '../../../lib/ws/realtime-context';
import { useSessionUser } from '../../auth/use-session';
import { describeBidFailure } from '../bid-errors';
import { fetchBids, placeBid } from '../product-api';
import { useAuctionState } from '../use-auction-state';

import { BidPanelView } from './bid-panel-view';

export function BidPanel({ auctionId }: { auctionId: string }) {
  const user = useSessionUser();
  const connection = useConnectionStatus();
  const queryClient = useQueryClient();
  const { query: auctionQuery, apply } = useAuctionState(auctionId);
  const bidsQuery = useQuery({
    queryKey: queryKeys.auctionBids(auctionId),
    queryFn: () => fetchBids(auctionId),
  });

  // One idempotency key per bidding action: a retry of the same amount reuses it.
  const keySession = useRef(new IdempotencySession());
  const lastAmount = useRef<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const bid = useMutation({
    mutationFn: (amountCents: number) => {
      if (lastAmount.current !== amountCents) {
        keySession.current.reset();
        lastAmount.current = amountCents;
      }
      return placeBid({ auctionId, amountCents, key: keySession.current.current() });
    },
    onSuccess: (placed) => {
      setFailure(null);
      keySession.current.reset();
      lastAmount.current = null;
      apply(placed.auction);
    },
    onError: (error) => {
      const outcome = describeBidFailure(error);
      setFailure(outcome.message);
      if (outcome.definitive) {
        keySession.current.reset();
        lastAmount.current = null;
      }
      if (outcome.refresh) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.auction(auctionId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.auctionBids(auctionId) });
      }
    },
  });

  if (auctionQuery.isPending) {
    return <Skeleton className="h-72" />;
  }
  if (auctionQuery.isError) {
    return (
      <ErrorState
        message="Could not load the auction."
        onRetry={() => void auctionQuery.refetch()}
      />
    );
  }

  const bids = bidsQuery.data?.items;
  const isWinner = bids?.[0]?.isOwn === true;

  return (
    <BidPanelView
      auction={auctionQuery.data}
      bids={bids}
      connection={connection}
      signedIn={user !== null}
      isWinner={isWinner}
      pending={bid.isPending}
      error={failure}
      onBid={(amountCents) => {
        setFailure(null);
        bid.mutate(amountCents);
      }}
    />
  );
}
