import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';

import { cn } from './cn';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'border border-line bg-white text-ink hover:bg-slate-50',
  danger: 'bg-danger text-white hover:bg-red-800',
  ghost: 'text-brand hover:bg-blue-50',
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60';

/** A link that looks like a button, so that no button is nested inside an anchor. */
export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: LinkProps & { variant?: Variant }) {
  return <Link className={cn(base, variants[variant], className)} {...props} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  loading = false,
  className,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], className)}
      disabled={disabled === true || loading}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
