import { useState } from 'react';

import { Button } from './button';
import { Modal } from './modal';
import { Textarea } from './textarea';

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
      <Textarea
        id="reason-text"
        label={label ?? 'Reason'}
        rows={3}
        maxLength={maxLength}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
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
