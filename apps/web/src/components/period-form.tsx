import { useState, type ReactNode } from 'react';

import { Button } from './button';
import { Input } from './input';

export interface Period {
  from: string;
  to: string;
}

interface PeriodFormProps {
  initial: Period;
  onApply: (period: Period) => void;
  /** Extra controls placed between the dates and the Apply button. */
  children?: ReactNode;
}

/** A pair of day pickers that takes effect only when applied, and only when it is a valid range. */
export function PeriodForm({ initial, onApply, children }: PeriodFormProps) {
  const [draft, setDraft] = useState(initial);
  const valid = draft.from !== '' && draft.to !== '' && draft.from <= draft.to;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          onApply(draft);
        }
      }}
    >
      <Input
        label="From"
        type="date"
        value={draft.from}
        max={draft.to}
        onChange={(event) => {
          setDraft((current) => ({ ...current, from: event.target.value }));
        }}
      />
      <Input
        label="To"
        type="date"
        value={draft.to}
        min={draft.from}
        onChange={(event) => {
          setDraft((current) => ({ ...current, to: event.target.value }));
        }}
      />
      {children}
      <Button type="submit" disabled={!valid}>
        Apply
      </Button>
    </form>
  );
}
