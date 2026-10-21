import { useSyncExternalStore } from 'react';

import { sessionStore, type SessionUser } from '../../lib/session';

export function useSessionUser(): SessionUser | null {
  return useSyncExternalStore(
    (listener) => sessionStore.subscribe(listener),
    () => sessionStore.getUser(),
  );
}
