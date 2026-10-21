import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  detail?: string;
  /** What the visitor can do about it, for example a link back to the catalog. */
  action?: ReactNode;
}

export function EmptyState({ title, detail, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {detail !== undefined ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
      {action !== undefined ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
