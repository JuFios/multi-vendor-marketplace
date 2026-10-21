import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { Button } from '../../../components/button';
import { Modal } from '../../../components/modal';
import { Money } from '../../../components/money';
import { errorMessage } from '../../../lib/api/error-message';
import { isApiError } from '../../../lib/api/errors';
import { IdempotencySession } from '../../../lib/api/idempotency';
import type { SellerOrder } from '../../orders/orders-api';
import { describeRefund, remainingQuantity } from '../refund';
import { refundSellerOrder } from '../seller-api';

interface RefundDialogProps {
  order: SellerOrder | null;
  onClose: () => void;
  onRefunded: () => void;
}

function RefundForm({ order, onRefunded }: { order: SellerOrder; onRefunded: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const attempt = useRef({ session: new IdempotencySession(), signature: '' });
  const preview = describeRefund(order, { quantities });
  const reasonValid = reason.trim().length > 0 && reason.trim().length <= 500;

  const refund = useMutation({
    mutationFn: () => {
      // The key belongs to one concrete refund; a different selection or reason is a new action.
      const signature = JSON.stringify({ quantities, reason: reason.trim() });
      if (attempt.current.signature !== signature) {
        attempt.current.session.reset();
        attempt.current.signature = signature;
      }
      return refundSellerOrder({
        id: order.id,
        key: attempt.current.session.current(),
        reason: reason.trim(),
        items: preview.lines.map((line) => ({
          sellerOrderItemId: line.item.id,
          quantity: line.quantity,
        })),
      });
    },
    onSuccess: () => {
      attempt.current.session.reset();
      onRefunded();
    },
    onError: (error) => {
      if (isApiError(error) && error.status < 500) {
        attempt.current.session.reset();
      }
    },
  });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line text-sm">
        {order.items.map((item) => {
          const remaining = remainingQuantity(item);
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                {item.title}
                <span className="ml-2 text-xs text-muted">
                  <Money cents={item.unitPriceCents} /> each · {remaining} left to refund
                </span>
              </span>
              <input
                type="number"
                min={0}
                max={remaining}
                disabled={remaining === 0}
                aria-label={`Refund quantity of ${item.title}`}
                className="w-20 rounded-md border border-line px-2 py-1 text-right"
                value={quantities[item.id] ?? 0}
                onChange={(event) => {
                  const value = Math.max(0, Math.floor(Number(event.target.value) || 0));
                  setQuantities((current) => ({ ...current, [item.id]: value }));
                }}
              />
            </li>
          );
        })}
      </ul>

      <label className="flex flex-col gap-1 text-sm" htmlFor="refund-reason">
        <span className="font-medium">Reason</span>
        <textarea
          id="refund-reason"
          rows={2}
          maxLength={500}
          className="rounded-md border border-line px-3 py-2 outline-none ring-brand focus:ring-2"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </label>

      <dl
        className="grid grid-cols-2 gap-1 rounded-md bg-slate-50 p-3 text-sm"
        aria-label="Refund preview"
      >
        <dt>Refund to the buyer</dt>
        <dd className="text-right font-medium">
          <Money cents={preview.amountCents} />
        </dd>
        <dt>Commission after refund</dt>
        <dd className="text-right">
          <Money cents={preview.commissionAfterCents} />
        </dd>
        <dt>Commission returned to you</dt>
        <dd className="text-right">
          <Money cents={preview.commissionReturnedCents} />
        </dd>
        <dt>Your payout after refund</dt>
        <dd className="text-right font-medium">
          <Money cents={preview.payoutAfterCents} />
        </dd>
      </dl>
      {preview.exceeds ? (
        <p role="alert" className="text-sm text-danger">
          You cannot refund more units than are left.
        </p>
      ) : null}
      {refund.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(refund.error)}
        </p>
      ) : null}
      <Button
        disabled={!preview.valid || !reasonValid}
        loading={refund.isPending}
        onClick={() => {
          refund.mutate();
        }}
      >
        Refund <Money cents={preview.amountCents} />
      </Button>
    </div>
  );
}

export function RefundDialog({ order, onClose, onRefunded }: RefundDialogProps) {
  return (
    <Modal open={order !== null} title="Refund items" onClose={onClose}>
      {order !== null ? <RefundForm order={order} onRefunded={onRefunded} /> : null}
    </Modal>
  );
}
