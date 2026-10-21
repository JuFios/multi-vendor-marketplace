import { ButtonLink } from '../../components/button';
import { EmptyState } from '../../components/empty-state';

export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md">
      <EmptyState
        title="403 — Access denied"
        detail="You do not have access to this section."
        action={<ButtonLink to="/">Go to the catalog</ButtonLink>}
      />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md">
      <EmptyState
        title="404 — Page not found"
        action={<ButtonLink to="/">Go to the catalog</ButtonLink>}
      />
    </div>
  );
}
