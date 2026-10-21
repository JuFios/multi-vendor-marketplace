import { Link } from 'react-router';

import { EmptyState } from '../../components/empty-state';

export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <EmptyState title="403 — Access denied" detail="You do not have access to this section." />
      <Link to="/" className="mt-4 inline-block text-sm text-brand">
        Go to the catalog
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <EmptyState title="404 — Page not found" />
      <Link to="/" className="mt-4 inline-block text-sm text-brand">
        Go to the catalog
      </Link>
    </div>
  );
}
