import { type InputHTMLAttributes, forwardRef } from 'react';

import { cn } from './cn';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name ?? label;
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={inputId}>
      <span className="font-medium text-ink">{label}</span>
      <input
        id={inputId}
        ref={ref}
        className={cn(
          'rounded-md border border-line bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2',
          error !== undefined && 'border-danger',
          className,
        )}
        {...props}
      />
      {error !== undefined ? <span className="text-danger">{error}</span> : null}
    </label>
  );
});
