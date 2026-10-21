import { useState } from 'react';

import { Button } from './button';
import { Modal } from './modal';

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  maxLength?: number;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

function ReasonForm({
  description,
  label,
  confirmLabel,
  pending,
  error,
  maxLength,
  onConfirm,
}: Omit<ReasonDialogProps, 'open' | 'title' | 'onClose'>) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  return (
    <div className="space-y-3">
      {description !== undefined ? <p className="text-sm">{description}</p> : null}
      <label className="flex flex-col gap-1 text-sm" htmlFor="reason-text">
        <span className="font-medium">{label ?? 'Reason'}</span>
        <textarea
          id="reason-text"
          rows={3}
          maxLength={maxLength}
          className="rounded-md border border-line px-3 py-2 outline-none ring-brand focus:ring-2"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        variant="danger"
        disabled={trimmed === ''}
        loading={pending ?? false}
        onClick={() => {
          onConfirm(trimmed);
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}

/** Asks for a mandatory free-text reason (rejections, cancellations). */
export function ReasonDialog({ open, title, onClose, ...form }: ReasonDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <ReasonForm {...form} maxLength={form.maxLength ?? 500} />
    </Modal>
  );
}
