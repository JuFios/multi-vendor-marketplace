import { type TextareaHTMLAttributes, forwardRef } from 'react';

import { cn } from './cn';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string | undefined;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className, id, ...props },
  ref,
) {
  const textareaId = id ?? props.name ?? label;
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={textareaId}>
      <span className="font-medium text-ink">{label}</span>
      <textarea
        id={textareaId}
        ref={ref}
        className={cn(
          'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2',
          error !== undefined && 'border-danger',
          className,
        )}
        {...props}
      />
      {error !== undefined ? <span className="text-danger">{error}</span> : null}
    </label>
  );
});
