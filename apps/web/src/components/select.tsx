import { type SelectHTMLAttributes, forwardRef } from 'react';

import { cn } from './cn';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string | undefined;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className, id, children, ...props },
  ref,
) {
  const selectId = id ?? props.name ?? label;
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={selectId}>
      <span className="font-medium text-ink">{label}</span>
      <select
        id={selectId}
        ref={ref}
        className={cn(
          'rounded-md border border-line bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2',
          error !== undefined && 'border-danger',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error !== undefined ? <span className="text-danger">{error}</span> : null}
    </label>
  );
});
