import { useState } from 'react';

import { Button } from '../../../components/button';
import { Money } from '../../../components/money';
import { Select } from '../../../components/select';
import { Textarea } from '../../../components/textarea';
import type { SellerOrder } from '../../orders/orders-api';
import { remainingQuantity } from '../../seller/refund';
import type { ResolveBody } from '../admin-api';
import {
  NOTE_MAX_LENGTH,
  toResolveBody,
  validateResolution,
  type ResolutionValues,
} from '../dispute-resolution';

interface DisputeResolutionFormProps {
  sellerOrder: Pick<SellerOrder, 'items' | 'status'>;
  pending: boolean;
  error?: string | null;
  onSubmit: (body: ResolveBody) => void;
}

export function DisputeResolutionForm({
  sellerOrder,
  pending,
  error = null,
  onSubmit,
}: DisputeResolutionFormProps) {
  const [values, setValues] = useState<ResolutionValues>({
    outcome: 'RESOLVED_BUYER_FAVOR',
    quantities: {},
    finalStatus: '',
    note: '',
  });
  const [touched, setTouched] = useState(false);
  const problem = validateResolution(values, sellerOrder);
  const buyerWins = values.outcome === 'RESOLVED_BUYER_FAVOR';

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (problem === null) {
          onSubmit(toResolveBody(values));
        }
      }}
    >
      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold">Decision</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="outcome"
            checked={buyerWins}
            onChange={() => {
              setValues((current) => ({ ...current, outcome: 'RESOLVED_BUYER_FAVOR' }));
            }}
          />
          In favour of the buyer
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="outcome"
            checked={!buyerWins}
            onChange={() => {
              setValues((current) => ({ ...current, outcome: 'RESOLVED_SELLER_FAVOR' }));
            }}
          />
          In favour of the seller
        </label>
      </fieldset>

      {buyerWins ? (
        <>
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold">Items to refund</legend>
            {sellerOrder.items.map((item) => {
              const remaining = remainingQuantity(item);
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {item.title}
                    <span className="ml-2 text-xs text-muted">
                      <Money cents={item.unitPriceCents} /> each · {remaining} left
                    </span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={remaining}
                    disabled={remaining === 0}
                    aria-label={`Refund quantity of ${item.title}`}
                    className="w-20 rounded-md border border-line px-2 py-1 text-right"
                    value={values.quantities[item.id] ?? 0}
                    onChange={(event) => {
                      const quantity = Math.max(0, Math.floor(Number(event.target.value) || 0));
                      setValues((current) => ({
                        ...current,
                        quantities: { ...current.quantities, [item.id]: quantity },
                      }));
                    }}
                  />
                </div>
              );
            })}
          </fieldset>
          <Select
            label="Final status of the shipment"
            value={values.finalStatus}
            onChange={(event) => {
              setValues((current) => ({
                ...current,
                finalStatus: event.target.value as ResolutionValues['finalStatus'],
              }));
            }}
          >
            <option value="">Keep the current status ({sellerOrder.status.toLowerCase()})</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="COMPLETED">Completed</option>
          </Select>
        </>
      ) : null}

      <Textarea
        id="resolution-note"
        label="Note for both parties"
        rows={3}
        maxLength={NOTE_MAX_LENGTH}
        value={values.note}
        onChange={(event) => {
          setValues((current) => ({ ...current, note: event.target.value }));
        }}
      />

      {touched && problem !== null ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={pending}>
        Resolve dispute
      </Button>
    </form>
  );
}
