import { createContext, useContext } from 'react';

import type { ConnectionStatus } from './realtime';

export const RealtimeContext = createContext<ConnectionStatus>('offline');

export function useConnectionStatus(): ConnectionStatus {
  return useContext(RealtimeContext);
}
