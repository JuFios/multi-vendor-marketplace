import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../lib/query-keys';

import { fetchProviders } from './api/auth-api';

export function GoogleButton() {
  const providers = useQuery({ queryKey: queryKeys.providers, queryFn: fetchProviders });
  if (providers.data?.google !== true) {
    return null;
  }
  return (
    <a
      href="/api/auth/google"
      className="inline-flex w-full items-center justify-center rounded-md border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
    >
      Continue with Google
    </a>
  );
}
