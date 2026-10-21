import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';

import { ErrorState } from '../../components/error-state';
import { Spinner } from '../../components/spinner';
import { refreshSession } from '../../lib/api/api';

/** Google redirects here with the refresh cookie set and no token in the URL. */
export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const providerError = params.get('error');
  const [state, setState] = useState<'pending' | 'done' | 'failed'>(
    providerError === null ? 'pending' : 'failed',
  );

  useEffect(() => {
    if (providerError !== null) {
      return;
    }
    let active = true;
    void refreshSession().then((token) => {
      if (active) {
        setState(token === null ? 'failed' : 'done');
      }
    });
    return () => {
      active = false;
    };
  }, [providerError]);

  if (state === 'done') {
    return <Navigate to="/" replace />;
  }
  if (state === 'failed') {
    return (
      <div className="mx-auto max-w-md">
        <ErrorState message="Google sign-in failed." />
        <p className="mt-3 text-center text-sm">
          <Link to="/login" className="text-brand">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="flex justify-center p-10">
      <Spinner />
    </div>
  );
}
