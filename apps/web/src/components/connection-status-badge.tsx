import type { ConnectionStatus } from '../lib/ws/realtime';

import { cn } from './cn';

const labels: Record<ConnectionStatus, string> = {
  connected: 'Live',
  connecting: 'Reconnecting…',
  offline: 'Offline',
};

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
        status === 'connected' && 'bg-emerald-100 text-emerald-800',
        status === 'connecting' && 'bg-amber-100 text-amber-800',
        status === 'offline' && 'bg-slate-200 text-slate-700',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'connected' && 'bg-ok',
          status === 'connecting' && 'bg-warn',
          status === 'offline' && 'bg-slate-500',
        )}
      />
      {labels[status]}
    </span>
  );
}
