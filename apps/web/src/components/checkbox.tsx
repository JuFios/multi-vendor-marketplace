import { type InputHTMLAttributes, forwardRef } from 'react';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, ...props },
  ref,
) {
  const boxId = id ?? props.name ?? label;
  return (
    <label className="inline-flex items-center gap-2 text-sm" htmlFor={boxId}>
      <input id={boxId} ref={ref} type="checkbox" className="h-4 w-4 accent-brand" {...props} />
      {label}
    </label>
  );
});
