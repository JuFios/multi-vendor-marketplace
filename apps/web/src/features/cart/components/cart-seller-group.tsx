import { Link } from 'react-router';

import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { cn } from '../../../components/cn';
import { Money } from '../../../components/money';
import { StatusBadge } from '../../../components/status-badge';
import type { CartGroup, CartItem } from '../cart-api';

export type ItemProblem = 'UNAVAILABLE' | 'INSUFFICIENT_STOCK';

interface CartSellerGroupProps {
  group: CartGroup;
  /** Items the last checkout attempt refused, highlighted for the buyer. */
  problems?: ReadonlyMap<string, ItemProblem>;
  readOnly?: boolean;
  onQuantityChange?: (productId: string, quantity: number) => void;
  onRemove?: (productId: string) => void;
}

function problemOf(item: CartItem, problems?: ReadonlyMap<string, ItemProblem>) {
  const flagged = problems?.get(item.productId);
  if (flagged !== undefined) {
    return flagged;
  }
  return item.availability === 'AVAILABLE' ? null : item.availability;
}

const PROBLEM_TEXT: Record<ItemProblem, (item: CartItem) => string> = {
  UNAVAILABLE: () => 'No longer available',
  INSUFFICIENT_STOCK: (item) => `Only ${item.stock} in stock`,
};

export function CartSellerGroup({
  group,
  problems,
  readOnly = false,
  onQuantityChange,
  onRemove,
}: CartSellerGroupProps) {
  return (
    <Card className="space-y-3" aria-label={`Items from ${group.seller.name}`}>
      <h2 className="font-semibold">{group.seller.name}</h2>
      <ul className="divide-y divide-line">
        {group.items.map((item) => {
          const problem = problemOf(item, problems);
          return (
            <li
              key={item.productId}
              data-problem={problem ?? undefined}
              className={cn(
                'flex flex-wrap items-center gap-3 py-3',
                problem !== null && 'rounded-md bg-red-50 px-2',
              )}
            >
              <div className="min-w-40 flex-1">
                <Link to={`/products/${item.productId}`} className="font-medium hover:underline">
                  {item.title}
                </Link>
                <p className="text-sm text-muted">
                  <Money cents={item.unitPriceCents} /> each
                </p>
                {problem !== null ? (
                  <p role="alert" className="text-sm text-danger">
                    {PROBLEM_TEXT[problem](item)}
                  </p>
                ) : null}
              </div>
              {readOnly ? (
                <span className="text-sm">× {item.quantity}</span>
              ) : (
                <div
                  className="flex items-center gap-1"
                  role="group"
                  aria-label={`Quantity of ${item.title}`}
                >
                  <Button
                    variant="secondary"
                    aria-label={`Decrease quantity of ${item.title}`}
                    disabled={item.quantity <= 1}
                    onClick={() => onQuantityChange?.(item.productId, item.quantity - 1)}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center tabular-nums" aria-live="polite">
                    {item.quantity}
                  </span>
                  <Button
                    variant="secondary"
                    aria-label={`Increase quantity of ${item.title}`}
                    disabled={item.quantity >= item.stock}
                    onClick={() => onQuantityChange?.(item.productId, item.quantity + 1)}
                  >
                    +
                  </Button>
                </div>
              )}
              <div className="w-24 text-right font-medium">
                <Money cents={item.lineTotalCents} />
              </div>
              {readOnly ? (
                problem !== null ? (
                  <StatusBadge status={problem} />
                ) : null
              ) : (
                <Button
                  variant="ghost"
                  aria-label={`Remove ${item.title}`}
                  onClick={() => onRemove?.(item.productId)}
                >
                  Remove
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-right text-sm">
        Subtotal:{' '}
        <strong>
          <Money cents={group.subtotalCents} />
        </strong>
      </p>
    </Card>
  );
}
