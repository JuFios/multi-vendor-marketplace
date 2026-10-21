import { Link } from 'react-router';

import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Money } from '../../../components/money';
import { StatusBadge } from '../../../components/status-badge';
import { formatDateTime } from '../../../lib/format';
import type { SellerOrder } from '../orders-api';

type OrderItem = SellerOrder['items'][number];

export interface SellerOrderCardProps {
  sellerOrder: SellerOrder;
  /** An existing dispute for this shipment, if any. */
  dispute?: { id: string; status: string } | undefined;
  disputeBasePath?: string;
  busy?: boolean;
  onCancel?: () => void;
  onConfirmReceipt?: () => void;
  onReview?: (item: OrderItem) => void;
  onOpenDispute?: () => void;
}

const DISPUTABLE = ['PROCESSING', 'SHIPPED', 'COMPLETED'];

export function SellerOrderCard({
  sellerOrder,
  dispute,
  disputeBasePath = '/account/disputes',
  busy = false,
  onCancel,
  onConfirmReceipt,
  onReview,
  onOpenDispute,
}: SellerOrderCardProps) {
  const { status } = sellerOrder;
  return (
    <Card className="space-y-3" aria-label={`Shipment from ${sellerOrder.seller.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{sellerOrder.seller.name}</h3>
        <span className="flex items-center gap-2">
          <StatusBadge status={status} />
          {sellerOrder.paymentStatus === 'FAILED' ? (
            <span className="text-xs text-danger">Payment failed</span>
          ) : null}
        </span>
      </div>

      <ul className="divide-y divide-line text-sm">
        {sellerOrder.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <Link to={`/products/${item.productId}`} className="hover:underline">
                {item.title}
              </Link>{' '}
              × {item.quantity}
              {item.refundedQuantity > 0 ? (
                <span className="ml-2 text-xs text-warn">{item.refundedQuantity} refunded</span>
              ) : null}
            </span>
            <span className="flex items-center gap-3">
              <Money cents={item.lineTotalCents} />
              {status === 'COMPLETED' && onReview !== undefined ? (
                <Button
                  variant="ghost"
                  aria-label={`Review ${item.title}`}
                  onClick={() => {
                    onReview(item);
                  }}
                >
                  Leave a review
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="text-right text-sm">
        {sellerOrder.refundedCents > 0 ? (
          <p className="text-warn">
            Refunded: <Money cents={sellerOrder.refundedCents} />
          </p>
        ) : null}
        <p>
          Subtotal:{' '}
          <strong>
            <Money cents={sellerOrder.subtotalCents} />
          </strong>
        </p>
      </div>

      <ol
        className="space-y-0.5 border-l-2 border-line pl-3 text-xs text-muted"
        aria-label="Status history"
      >
        {sellerOrder.statusHistory.map((entry) => (
          <li key={`${entry.at}-${entry.to}`}>
            {entry.from !== null && entry.from !== undefined ? `${entry.from} → ` : ''}
            <strong>{entry.to}</strong> · {entry.actor.toLowerCase()} · {formatDateTime(entry.at)}
            {entry.reason ? ` — ${entry.reason}` : ''}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {status === 'NEW' && onCancel !== undefined ? (
          <Button variant="danger" disabled={busy} onClick={onCancel}>
            Cancel shipment
          </Button>
        ) : null}
        {status === 'SHIPPED' && onConfirmReceipt !== undefined ? (
          <Button disabled={busy} onClick={onConfirmReceipt}>
            Confirm receipt
          </Button>
        ) : null}
        {dispute !== undefined ? (
          <Link
            to={`${disputeBasePath}/${dispute.id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-brand"
          >
            View dispute <StatusBadge status={dispute.status} />
          </Link>
        ) : DISPUTABLE.includes(status) && onOpenDispute !== undefined ? (
          <Button variant="secondary" disabled={busy} onClick={onOpenDispute}>
            Open a dispute
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
