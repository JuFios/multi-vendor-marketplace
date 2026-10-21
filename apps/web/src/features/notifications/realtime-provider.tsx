import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useToast } from '../../components/toast-context';
import { queryKeys } from '../../lib/query-keys';
import { realtimeClient, type ConnectionStatus } from '../../lib/ws/realtime';
import { RealtimeContext } from '../../lib/ws/realtime-context';
import { WS_EVENT, type NotificationPayload } from '../../lib/ws/ws-events';
import { useSessionUser } from '../auth/use-session';

import { describeNotification } from './describe-notification';
import { fetchNotifications } from './notifications-api';

const INVALIDATED_ON_RESYNC = [['orders'], ['order'], ['seller'], ['notifications'], ['cart']];

function isNotification(payload: unknown): payload is NotificationPayload {
  return typeof payload === 'object' && payload !== null && 'id' in payload && 'type' in payload;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useSessionUser();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<ConnectionStatus>(realtimeClient.getStatus());
  const lastSeenAt = useRef<string | null>(null);
  const hasConnected = useRef(false);

  useEffect(() => realtimeClient.onStatus(setStatus), []);

  // The handshake token decides which private rooms the socket joins, so identity changes reconnect.
  useEffect(() => {
    hasConnected.current = false;
    lastSeenAt.current = null;
    realtimeClient.connect();
    return () => {
      realtimeClient.disconnect();
    };
  }, [userId]);

  useEffect(() => {
    const stopConnect = realtimeClient.onConnect(() => {
      const isReconnect = hasConnected.current;
      hasConnected.current = true;
      if (userId === undefined) {
        return;
      }
      if (!isReconnect) {
        void fetchNotifications({ page: 1, limit: 1 })
          .then((page) => {
            lastSeenAt.current ??= page.items[0]?.createdAt ?? new Date().toISOString();
          })
          .catch(() => undefined);
        return;
      }
      for (const key of INVALIDATED_ON_RESYNC) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      const since = lastSeenAt.current;
      if (since !== null) {
        void fetchNotifications({ page: 1, limit: 20, after: since })
          .then((page) => {
            for (const item of [...page.items].reverse()) {
              toast.push(describeNotification(item.type));
              lastSeenAt.current = item.createdAt;
            }
          })
          .catch(() => undefined);
      }
    });

    const stopUser = realtimeClient.onUserEvent((event, payload) => {
      if (event === WS_EVENT.NOTIFICATION && isNotification(payload)) {
        lastSeenAt.current = payload.createdAt;
        toast.push(describeNotification(payload.type));
        void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        return;
      }
      if (event === WS_EVENT.SELLER_ORDER_CREATED) {
        toast.push('New order received', 'ok');
      }
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order'] });
      void queryClient.invalidateQueries({ queryKey: ['seller'] });
    });

    return () => {
      stopConnect();
      stopUser();
    };
  }, [queryClient, toast, userId]);

  return <RealtimeContext.Provider value={status}>{children}</RealtimeContext.Provider>;
}
