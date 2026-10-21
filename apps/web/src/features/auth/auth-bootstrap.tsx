import { useEffect, useState, type ReactNode } from 'react';

import { Spinner } from '../../components/spinner';
import { refreshSession } from '../../lib/api/api';

/** Restores the session from the refresh cookie before any route renders. */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void refreshSession().finally(() => {
      if (active) {
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return children;
}
