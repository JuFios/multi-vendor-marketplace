import { cn } from './cn';

const tones: Record<string, string> = {
  NEW: 'bg-sky-100 text-sky-800',
  PROCESSING: 'bg-amber-100 text-amber-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  PARTIALLY_SHIPPED: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  SOLD_TO_WINNER: 'bg-amber-100 text-amber-800',
  ORDERED: 'bg-indigo-100 text-indigo-800',
  NOT_SOLD: 'bg-slate-200 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  OPEN: 'bg-amber-100 text-amber-800',
  UNDER_REVIEW: 'bg-sky-100 text-sky-800',
  RESOLVED_BUYER_FAVOR: 'bg-emerald-100 text-emerald-800',
  RESOLVED_SELLER_FAVOR: 'bg-slate-200 text-slate-700',
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  INSUFFICIENT_STOCK: 'bg-amber-100 text-amber-800',
  UNAVAILABLE: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        tones[status] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function OrderStatusBadge({
  status,
  hasCancelledParts,
}: {
  status: string;
  hasCancelledParts?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge status={status} />
      {hasCancelledParts === true ? (
        <span className="text-xs text-warn">Partial cancellation</span>
      ) : null}
    </span>
  );
}
