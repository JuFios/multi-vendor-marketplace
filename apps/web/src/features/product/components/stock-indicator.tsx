import { cn } from '../../../components/cn';

export const LOW_STOCK_THRESHOLD = 5;

export function StockIndicator({ stock }: { stock: number }) {
  if (stock <= 0) {
    return <span className="text-sm font-medium text-danger">Out of stock</span>;
  }
  return (
    <span
      className={cn('text-sm font-medium', stock <= LOW_STOCK_THRESHOLD ? 'text-warn' : 'text-ok')}
    >
      {stock <= LOW_STOCK_THRESHOLD ? `Only ${stock} left` : 'In stock'}
    </span>
  );
}
