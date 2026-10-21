import { useEffect, useRef } from 'react';

import { realtimeClient } from '../lib/ws/realtime';
import {
  shouldApplyVersion,
  type AuctionStatePayload,
  type ProductStockPayload,
  type WsChannel,
} from '../lib/ws/ws-events';

type ChannelState = ProductStockPayload | AuctionStatePayload;

export function useChannel(
  channel: WsChannel,
  id: string | undefined,
  onSnapshot: (state: ChannelState) => void,
  onEvent: (state: ChannelState) => void,
): void {
  const snapshotRef = useRef(onSnapshot);
  const eventRef = useRef(onEvent);
  const versionRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    snapshotRef.current = onSnapshot;
    eventRef.current = onEvent;
  });

  useEffect(() => {
    versionRef.current = undefined;
    if (id === undefined || id === '') {
      return;
    }
    return realtimeClient.follow(
      { channel, id },
      {
        onSnapshot: (state) => {
          versionRef.current = state.version;
          snapshotRef.current(state);
        },
        onEvent: (state) => {
          if (!shouldApplyVersion(versionRef.current, state.version)) {
            return;
          }
          versionRef.current = state.version;
          eventRef.current(state);
        },
      },
    );
  }, [channel, id]);
}
