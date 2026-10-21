import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ToastProvider } from '../components/toast';
import { AuthBootstrap } from '../features/auth/auth-bootstrap';
import { RealtimeProvider } from '../features/notifications/realtime-provider';
import { createQueryClient } from '../lib/query-client';

import { ErrorBoundary } from './error-boundary';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthBootstrap>
            <RealtimeProvider>{children}</RealtimeProvider>
          </AuthBootstrap>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
