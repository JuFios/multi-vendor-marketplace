import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useChannel } from '../../hooks/use-channel';
import { queryKeys } from '../../lib/query-keys';
import type { AuctionStatePayload, ProductStockPayload } from '../../lib/ws/ws-events';

import { fetchAuction, type AuctionState } from './product-api';

/** Live view of one auction: the REST state, kept current by the channel and never moved back. */
export function useAuctionState(auctionId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.auction(auctionId),
    queryFn: () => fetchAuction(auctionId),
  });

  const apply = useCallback(
    (incoming: AuctionState) => {
      queryClient.setQueryData<AuctionState>(queryKeys.auction(auctionId), (previous) =>
        previous !== undefined && previous.version > incoming.version
          ? previous
          : { ...previous, ...incoming },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.auctionBids(auctionId) });
    },
    [queryClient, auctionId],
  );

  const onState = useCallback(
    (state: AuctionStatePayload | ProductStockPayload) => {
      if ('auctionId' in state) {
        const { auctionId: id, ...rest } = state;
        queryClient.setQueryData<AuctionState>(queryKeys.auction(id), (previous) =>
          previous === undefined || previous.version > rest.version
            ? previous
            : {
                ...previous,
                status: rest.status,
                round: rest.round,
                currentPriceCents: rest.currentPriceCents,
                minNextBidCents: rest.minNextBidCents,
                bidCount: rest.bidCount,
                leader: rest.leader,
                endsAt: rest.endsAt,
                winnerDeadlineAt: rest.winnerDeadlineAt,
                version: rest.version,
                serverTime: rest.serverTime,
              },
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.auctionBids(id) });
      }
    },
    [queryClient],
  );

  useChannel('auction', auctionId, onState, onState);

  return { query, apply };
}
